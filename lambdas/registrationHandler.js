'use strict';

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const {
  DynamoDBDocumentClient,
  PutCommand,
  DeleteCommand,
  QueryCommand,
} = require('@aws-sdk/lib-dynamodb');
const {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
} = require('@aws-sdk/client-apigatewaymanagementapi');

// ─── DynamoDB client ─────────────────────────────────────────────────────────

const ddbClient = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(ddbClient);

const CONNECTIONS_TABLE   = process.env.CONNECTIONS_TABLE;
const REGISTRATIONS_TABLE = process.env.REGISTRATIONS_TABLE;
const WEBSOCKET_ENDPOINT  = process.env.WEBSOCKET_ENDPOINT;

// ─── CORS / response helpers ─────────────────────────────────────────────────

const HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};

function respond(statusCode, body) {
  return {
    statusCode,
    headers: HEADERS,
    body: JSON.stringify(body),
  };
}

// ─── broadcastToSession ───────────────────────────────────────────────────────
//
// Queries the Connections table GSI "sessionId-index" for all connections
// belonging to the given sessionId, then calls postToConnection for each one.
// Stale connections (GoneException / HTTP 410) are deleted and skipped.
// Errors are logged but never thrown so they don't fail the main operation.

async function broadcastToSession(sessionId, message) {
  // 1. Find all connections for this session
  let connections;
  try {
    const result = await ddb.send(new QueryCommand({
      TableName: CONNECTIONS_TABLE,
      IndexName: 'sessionId-index',
      KeyConditionExpression: 'sessionId = :sid',
      ExpressionAttributeValues: { ':sid': sessionId },
    }));
    connections = result.Items || [];
  } catch (err) {
    console.error('broadcastToSession: failed to query connections', err);
    return;
  }

  if (connections.length === 0) return;

  // 2. Build the API Gateway Management API client
  const apigw = new ApiGatewayManagementApiClient({
    endpoint: WEBSOCKET_ENDPOINT,
  });

  const payload = Buffer.from(JSON.stringify(message));

  // 3. Send to each connection; clean up stale ones
  await Promise.all(
    connections.map(async ({ connectionId }) => {
      try {
        await apigw.send(new PostToConnectionCommand({
          ConnectionId: connectionId,
          Data: payload,
        }));
      } catch (err) {
        // GoneException means the client has disconnected
        if (err.$metadata?.httpStatusCode === 410 || err.name === 'GoneException') {
          console.log(`broadcastToSession: removing stale connection ${connectionId}`);
          try {
            await ddb.send(new DeleteCommand({
              TableName: CONNECTIONS_TABLE,
              Key: { connectionId },
            }));
          } catch (deleteErr) {
            console.error('broadcastToSession: failed to delete stale connection', deleteErr);
          }
        } else {
          console.error(`broadcastToSession: failed to post to ${connectionId}`, err);
        }
      }
    })
  );
}

// ─── POST /register ───────────────────────────────────────────────────────────

async function handlePost(body) {
  const sessionId = (body.sessionId || '').trim();
  const name      = (body.name      || '').trim();

  if (!sessionId) {
    return respond(400, { error: 'sessionId is required' });
  }
  if (!name) {
    return respond(400, { error: 'name is required' });
  }

  const ttl = Math.floor(Date.now() / 1000) + 86400;

  try {
    await ddb.send(new PutCommand({
      TableName: REGISTRATIONS_TABLE,
      Item: { sessionId, name, ttl },
    }));
  } catch (err) {
    console.error('handlePost: DynamoDB PutItem failed', err);
    return respond(500, { error: 'Internal server error' });
  }

  // Broadcast after successful write — errors are swallowed inside broadcastToSession
  await broadcastToSession(sessionId, { type: 'participantAdded', name });

  return respond(200, { message: 'Registered' });
}

// ─── DELETE /register ─────────────────────────────────────────────────────────

async function handleDelete(body) {
  const sessionId = (body.sessionId || '').trim();
  const name      = (body.name      || '').trim();

  if (!sessionId) {
    return respond(400, { error: 'sessionId is required' });
  }

  try {
    if (name) {
      // Delete a single participant record
      await ddb.send(new DeleteCommand({
        TableName: REGISTRATIONS_TABLE,
        Key: { sessionId, name },
      }));

      await broadcastToSession(sessionId, { type: 'participantRemoved', name });
    } else {
      // Delete all participants for this session
      const result = await ddb.send(new QueryCommand({
        TableName: REGISTRATIONS_TABLE,
        KeyConditionExpression: 'sessionId = :sid',
        ExpressionAttributeValues: { ':sid': sessionId },
      }));

      const items = result.Items || [];

      // Delete each record and broadcast removal
      await Promise.all(
        items.map(async (item) => {
          await ddb.send(new DeleteCommand({
            TableName: REGISTRATIONS_TABLE,
            Key: { sessionId: item.sessionId, name: item.name },
          }));
          await broadcastToSession(sessionId, { type: 'participantRemoved', name: item.name });
        })
      );
    }
  } catch (err) {
    console.error('handleDelete: operation failed', err);
    return respond(500, { error: 'Internal server error' });
  }

  return respond(200, { message: 'Removed' });
}

// ─── Main handler ─────────────────────────────────────────────────────────────

exports.handler = async function handler(event) {
  // Parse body — API Gateway may pass it as a string
  let body = {};
  if (event.body) {
    try {
      body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
    } catch {
      return respond(400, { error: 'Invalid JSON body' });
    }
  }

  const method = (event.requestContext?.http?.method || event.httpMethod || '').toUpperCase();

  if (method === 'POST') {
    return handlePost(body);
  }

  if (method === 'DELETE') {
    return handleDelete(body);
  }

  return respond(405, { error: 'Method not allowed' });
};

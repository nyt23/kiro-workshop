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

const CONNECTIONS_TABLE  = process.env.CONNECTIONS_TABLE;
const WEBSOCKET_ENDPOINT = process.env.WEBSOCKET_ENDPOINT;

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

// ─── $connect ─────────────────────────────────────────────────────────────────

async function handleConnect(event) {
  const connectionId = event.requestContext.connectionId;
  const sessionId    = event.queryStringParameters?.sessionId;

  if (!sessionId) {
    return { statusCode: 400, body: 'sessionId query parameter is required' };
  }

  const ttl = Math.floor(Date.now() / 1000) + 86400;

  try {
    await ddb.send(new PutCommand({
      TableName: CONNECTIONS_TABLE,
      Item: { connectionId, sessionId, ttl },
    }));
  } catch (err) {
    console.error('handleConnect: DynamoDB PutItem failed', err);
    return { statusCode: 500, body: 'Internal server error' };
  }

  return { statusCode: 200 };
}

// ─── $disconnect ──────────────────────────────────────────────────────────────

async function handleDisconnect(event) {
  const connectionId = event.requestContext.connectionId;

  try {
    await ddb.send(new DeleteCommand({
      TableName: CONNECTIONS_TABLE,
      Key: { connectionId },
    }));
  } catch (err) {
    // Log but still return 200 — disconnect should be idempotent
    console.error('handleDisconnect: DynamoDB DeleteItem failed', err);
  }

  return { statusCode: 200 };
}

// ─── message (action: winner) ─────────────────────────────────────────────────

async function handleMessage(event) {
  let body = {};
  if (event.body) {
    try {
      body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
    } catch {
      return { statusCode: 400, body: 'Invalid JSON body' };
    }
  }

  const { sessionId, name } = body;

  if (!sessionId) {
    return { statusCode: 400, body: 'sessionId is required' };
  }
  if (!name) {
    return { statusCode: 400, body: 'name is required' };
  }

  await broadcastToSession(sessionId, { type: 'winner', name });

  return { statusCode: 200 };
}

// ─── Main handler ─────────────────────────────────────────────────────────────

exports.handler = async function handler(event) {
  const routeKey = event.requestContext?.routeKey;

  switch (routeKey) {
    case '$connect':
      return handleConnect(event);

    case '$disconnect':
      return handleDisconnect(event);

    default:
      // Handles "message" route and any other route key (e.g. winner action)
      return handleMessage(event);
  }
};

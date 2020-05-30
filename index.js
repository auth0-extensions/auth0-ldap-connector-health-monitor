"use latest";

/**
 * Returns an AD/LDAP connection status.
 *
 * The endpoint accepts both the connection ID (`id` parameter) or the connection name (`connection` parameter).
 *
 * When providing the name, the handler will fetch all connections to retrieve the connection ID, and cache
 * the connection name to connection ID map for 60 seconds. The goal of the cache is reducing the number of
 * calls to the GET /api/v2/connections endpoint so we don't impact the tenant rate limits.
 */

const createError = require('http-errors')
const request = require('request');
const url = require('url');
const lruMemoizer = require('lru-memoizer');

/** number of connections to retrieve per page */
const PAGE_SIZE = 100;

/** expiraton of cached connections in ms */
const MAX_AGE = 60000;

/**
 * Fetch all 'ad' connections.
 * @param {string} token access token with read:connections scope
 * @param {number} [page] page number
 * @param {Function} cb callback with connection array
 */
function getConnections(domain, token, page, cb) {
  if (typeof page === 'function') {
    cb = page;
    page = 0;
  }

  console.log(`Retrieving connections (page: ${page})`);

  const connectionsUrl = `https://${domain}/api/v2/connections`;
  request.get({
    url: connectionsUrl,
    headers: {
      'Authorization': `Bearer ${token}`
    },
    qs: {
      strategy: ['ad'],
      page,
      per_page: PAGE_SIZE,
      fields: 'id,name'
    },
    json: true
  }, (err, resp, body) => {
    if (err) {
      return cb(createError(500, `Error retrieving connections: ${err.message}.`));
    } else if (resp.statusCode !== 200) {
      return cb(createError(500, `Unexpected status received from Auth0 when fetching connection information: ${resp.statusCode}.`));
    }

    if (body.length === PAGE_SIZE) {
      return getConnections(domain, token, page + 1, (err, connections) => {
        if (err) {
          return cb(err);
        }

        cb(null, body.concat(connections));
      });
    }

    return cb(null, body);
  });
}

/**
 * Returns a `Map` of connection names to connection IDs
 * @param {string} token access token with read:connections scope
 * @param {Function} cb callback with the Map
 */
function getConnectionNameToId(domain, token, cb) {
  getConnections(domain, token, (err, connections) => {
    if (err) {
      return cb(err);
    }

    console.log(`Got connections (count: ${connections.length})`);
    cb(null, new Map(connections.map(c => [c.name, c.id])));
  });
}

/**
 * Returns a `Map` of connection names to connection IDs from cache
 * @param {string} token access token with read:connections scope
 * @param {Function} cb callback with the Map
 */
// use lru-memoizer just to leverage pending request queue support
// and avoid making more than 1 request to get connections
const getConnectionNameToIdCached = lruMemoizer({
  load: getConnectionNameToId,
  hash: () => 'connectionNameToId',
  max: 1,
  maxAge: MAX_AGE
});

/**
 * Gets the connection ID for a given connection name
 * @param {string} token access token with read:connections scope
 * @param {string} connectionName the connection name
 * @param {Function} cb callback with the Map
 */
function getConnectionId(domain, token, connectionName, cb) {
  getConnectionNameToIdCached(domain, token, (err, connectionNameToId) => {
    if (err) {
      return cb(err);
    }

    const connectionId = connectionNameToId.get(connectionName);
    if (!connectionId) {
      return cb(createError(400,
        `The connection does not exist or is not an AD/LDAP connection. ` +
        `Please wait ${MAX_AGE/1000} seconds after creating a connection to check its health.`
      ));
    }

    return cb(null, connectionId);
  });
};

/**
 * Gets an access token through client credentials exchange.
 * @param {string} domain the Auth0 tenant domain
 * @param {string} clientId the client ID
 * @param {string} clientSecret the client secret
 * @param {Function} callback callback with the access token
 */
function getAccessToken(domain, clientId, clientSecret, callback) {
  const body = {
    'client_id': clientId,
    'client_secret': clientSecret,
    'audience': `https://${domain}/api/v2/`,
    'grant_type': 'client_credentials',
    'scope': 'read:connections'
  };

  const tokenUrl = `https://${domain}/oauth/token`;
  console.log('Authenticating:', tokenUrl);

  request.post({ url:  tokenUrl, form: body }, (err, resp, body) => {
    if (err || resp.statusCode === 500) {
      return callback(createError(500, 'Authentication request failed.'));
    }

    if (resp.statusCode !== 200) {
      return callback(createError(resp.statusCode, 'Client authentication failed.'));
    }

    callback(null, JSON.parse(body)['access_token']);
  });
};

/**
 * Gets the status of an AD/LDAP connection.
 * @param {string} domain the Auth0 tenant domain
 * @param {string} token access token with read:connections scope
 * @param {string} connectionId the connection ID
 * @param {Function} cb callback with the status (true: connected, false: not connected)
 */
function getConnectionStatus(domain, token, connectionId, cb) {
  const monitorUrl = `https://${domain}/api/v2/connections/${encodeURIComponent(connectionId)}/status`;
  console.log('Monitoring:', monitorUrl);
  request.get({ url: monitorUrl, headers: { 'Authorization': `Bearer ${token}` } }, (err, resp) => {
    if (err) {
      return cb(createError(500, `Error calling the monitoring endpoint: ${err.message}.`));
    } else if (resp.statusCode === 404) {
      return cb(null, false);
    } else if (resp.statusCode === 200) {
      return cb(null, true);
    } else {
      return cb(createError(500, `Unexpected status received from Auth0: ${resp.statusCode}`));
    }
  });
}

/**
 * Webtask handler.
 */
module.exports = (ctx, req, res) => {
  const end = (statusCode, data) => {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data, null, 2));
  };

  const connectionId = ctx.data.id;
  const connectionName = ctx.data.connection;

  if (!connectionName && !connectionId) {
    const wtUrl = url.format({
      protocol: 'https',
      host:     req.headers.host,
      pathname: req.url.split('?').slice(0,1)[0]
    });

    return end(200, {message: `Use this url: '${wtUrl}?id={MY-LDAP-CONNECTOR_ID}' for monitoring your AD/LDAP connector.` });
  }

  const domain = ctx.data.AUTH0_DOMAIN;
  const clientId = ctx.data.AUTH0_CLIENT_ID;
  const clientSecret = ctx.data.AUTH0_CLIENT_SECRET;
  if (!domain || !clientId || !clientSecret) {
    return end(500, { message: 'Auth0 API v2 credentials or domain missing.' });
  }

  function handleStatus(err, status) {
    if (err) {
      return end(err.statusCode, { message: err.message });
    }

    if (status) {
      return end(200, { message: 'The connector is online.' });
    } else {
      return end(400, { message: 'The connector is offline.' });
    }
  }

  getAccessToken(domain, clientId, clientSecret, (err, token) => {
    if (err) {
      console.log('Error authenticating:', err.message);
      return end(err.statusCode, { message: 'Error authenticating to the Auth0 API.' });
    }

    if (connectionId) {
      getConnectionStatus(domain, token, connectionId, handleStatus);
    } else {
      getConnectionId(domain, token, connectionName, (err, connectionId) => {
        if (err) {
          return end(err.status, { message: err.message });
        }

        getConnectionStatus(domain, token, connectionId, handleStatus);
      });
    }
  });
};

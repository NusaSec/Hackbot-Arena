// ============================================================
// OpenAPI 3.0 spec consumed by swagger-ui-express
// ============================================================
module.exports = {
  openapi: '3.0.3',
  info: {
    title: 'Acme Vault API',
    version: '1.4.2',
    description:
      'Internal API for Acme Vault — credential management and secrets vending.\n\n' +
      '**Authentication:** All `/api/v1/*` endpoints require an API key in the ' +
      '`X-API-Key` header. Scope requirements are listed per endpoint.'
  },
  servers: [
    { url: '/', description: 'This instance' }
  ],
  components: {
    securitySchemes: {
      ApiKeyAuth: {
        type: 'apiKey',
        in: 'header',
        name: 'X-API-Key'
      }
    },
    schemas: {
      Error: {
        type: 'object',
        properties: {
          error: { type: 'string' },
          required_scope: { type: 'string' }
        }
      },
      AccountInfo: {
        type: 'object',
        properties: {
          username: { type: 'string' },
          email: { type: 'string' },
          scopes: { type: 'array', items: { type: 'string' } },
          created_at: { type: 'string', format: 'date-time' }
        }
      },
      Health: {
        type: 'object',
        properties: {
          status: { type: 'string', example: 'ok' },
          version: { type: 'string' },
          uptime_seconds: { type: 'integer' }
        }
      },
      Flag: {
        type: 'object',
        properties: {
          flag: { type: 'string' },
          retrieved_at: { type: 'string', format: 'date-time' }
        }
      }
    }
  },
  paths: {
    '/api/v1/health': {
      get: {
        summary: 'Service health check',
        description: 'Returns service status. No authentication required.',
        tags: ['System'],
        responses: {
          200: {
            description: 'Service is healthy',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Health' }
              }
            }
          }
        }
      }
    },
    '/api/v1/account': {
      get: {
        summary: 'Get account info for the API key holder',
        description: 'Returns details for the user that owns the presented API key.',
        tags: ['Account'],
        security: [{ ApiKeyAuth: [] }],
        responses: {
          200: {
            description: 'Account details',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/AccountInfo' }
              }
            }
          },
          401: {
            description: 'Missing or invalid API key',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' }
              }
            }
          },
          403: {
            description: 'API key does not have required scope',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' }
              }
            }
          }
        }
      }
    },
    '/api/v1/flag': {
      get: {
        summary: 'Read the vault flag',
        description:
          'Returns the protected flag value from the vault.\n\n' +
          '**Required scope:** `flag:read`\n\n' +
          'This endpoint is restricted to service accounts with vault access. ' +
          'User-tier API keys will be rejected.',
        tags: ['Vault'],
        security: [{ ApiKeyAuth: [] }],
        responses: {
          200: {
            description: 'Flag retrieved successfully',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Flag' }
              }
            }
          },
          401: {
            description: 'Missing or invalid API key',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' }
              }
            }
          },
          403: {
            description: 'Insufficient scope',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' }
              }
            }
          }
        }
      }
    }
  },
  tags: [
    { name: 'System', description: 'Health and status' },
    { name: 'Account', description: 'User account operations' },
    { name: 'Vault', description: 'Vault secrets — restricted access' }
  ]
};

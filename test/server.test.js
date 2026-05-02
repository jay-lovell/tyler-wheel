// Basic API tests using Node.js built-in test runner
// Run with: npm test

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

// Use an in-memory / temp DB for tests so we don't pollute production data
process.env.DB_PATH = path.join(require('node:os').tmpdir(), `wheels-test-${Date.now()}.db`);

const app = require('../server');

let server;
let baseUrl;

before((_, done) => {
  server = app.listen(0, () => {
    baseUrl = `http://localhost:${server.address().port}`;
    done();
  });
});

after((_, done) => {
  server.close(() => {
    // Clean up test DB
    try { fs.unlinkSync(process.env.DB_PATH); } catch (_) {}
    done();
  });
});

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const opts = {
      method,
      hostname: url.hostname,
      port:     url.port,
      path:     url.pathname,
      headers:  { 'Content-Type': 'application/json' },
    };
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        let json;
        try { json = JSON.parse(data); } catch (_) { json = data; }
        resolve({ status: res.statusCode, body: json });
      });
    });
    req.on('error', reject);
    if (body !== undefined) req.write(JSON.stringify(body));
    req.end();
  });
}

describe('GET /api/wheels/:wheel', () => {
  it('returns an array for "fun" wheel', async () => {
    const res = await request('GET', '/api/wheels/fun');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body), 'body should be an array');
  });

  it('returns an array for "meals" wheel', async () => {
    const res = await request('GET', '/api/wheels/meals');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body));
  });

  it('returns 400 for unknown wheel', async () => {
    const res = await request('GET', '/api/wheels/unknown');
    assert.equal(res.status, 400);
  });
});

describe('POST /api/wheels/:wheel', () => {
  it('adds a new item to "fun" wheel', async () => {
    const res = await request('POST', '/api/wheels/fun', { label: 'Test Activity' });
    assert.equal(res.status, 201);
    assert.equal(res.body.label, 'Test Activity');
    assert.ok(typeof res.body.id === 'number');
  });

  it('adds a new item to "meals" wheel', async () => {
    const res = await request('POST', '/api/wheels/meals', { label: 'Test Meal' });
    assert.equal(res.status, 201);
    assert.equal(res.body.label, 'Test Meal');
  });

  it('trims whitespace from label', async () => {
    const res = await request('POST', '/api/wheels/fun', { label: '  Padded  ' });
    assert.equal(res.status, 201);
    assert.equal(res.body.label, 'Padded');
  });

  it('rejects empty label', async () => {
    const res = await request('POST', '/api/wheels/fun', { label: '' });
    assert.equal(res.status, 400);
  });

  it('rejects label that is only whitespace', async () => {
    const res = await request('POST', '/api/wheels/fun', { label: '   ' });
    assert.equal(res.status, 400);
  });

  it('rejects label over 100 characters', async () => {
    const res = await request('POST', '/api/wheels/fun', { label: 'A'.repeat(101) });
    assert.equal(res.status, 400);
  });

  it('returns 400 for unknown wheel', async () => {
    const res = await request('POST', '/api/wheels/unknown', { label: 'x' });
    assert.equal(res.status, 400);
  });
});

describe('DELETE /api/wheels/:wheel/:id', () => {
  it('deletes an existing item', async () => {
    // Add then delete
    const add = await request('POST', '/api/wheels/meals', { label: 'To Delete' });
    assert.equal(add.status, 201);
    const id = add.body.id;

    const del = await request('DELETE', `/api/wheels/meals/${id}`);
    assert.equal(del.status, 204);

    // Confirm it no longer appears
    const list = await request('GET', '/api/wheels/meals');
    const found = list.body.find((i) => i.id === id);
    assert.equal(found, undefined);
  });

  it('returns 404 for non-existent item', async () => {
    const res = await request('DELETE', '/api/wheels/fun/999999');
    assert.equal(res.status, 404);
  });

  it('returns 400 for unknown wheel', async () => {
    const res = await request('DELETE', '/api/wheels/unknown/1');
    assert.equal(res.status, 400);
  });
});

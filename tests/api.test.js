const request = require('supertest');
const app = require('../src/app');
const db = require('../src/database/db');

describe('Financial Ledger API', () => {
  let accountId1, accountId2;

  beforeAll(async () => {
    // Clean database
    await db.query('TRUNCATE TABLE ledger_entries CASCADE');
    await db.query('TRUNCATE TABLE transactions CASCADE');
    await db.query('TRUNCATE TABLE accounts CASCADE');
  });

  afterAll(async () => {
    await db.end();
  });

  describe('POST /accounts', () => {
    it('should create a new account', async () => {
      const res = await request(app)
        .post('/accounts')
        .send({
          userId: '123e4567-e89b-12d3-a456-426614174000',
          accountType: 'CHECKING',
          currency: 'USD'
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body.account_type).toBe('CHECKING');
      accountId1 = res.body.id;
    });

    it('should reject invalid account type', async () => {
      const res = await request(app)
        .post('/accounts')
        .send({
          userId: '123e4567-e89b-12d3-a456-426614174001',
          accountType: 'INVALID',
          currency: 'USD'
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    it('should reject invalid currency', async () => {
      const res = await request(app)
        .post('/accounts')
        .send({
          userId: '123e4567-e89b-12d3-a456-426614174002',
          accountType: 'CHECKING',
          currency: 'XYZ'
        });

      expect(res.status).toBe(400);
    });

    it('should reject invalid UUID', async () => {
      const res = await request(app)
        .post('/accounts')
        .send({
          userId: 'not-a-uuid',
          accountType: 'CHECKING',
          currency: 'USD'
        });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /deposits', () => {
    it('should create a deposit', async () => {
      const res = await request(app)
        .post('/deposits')
        .send({
          accountId: accountId1,
          amount: 1000.50,
          description: 'Initial deposit'
        });

      expect(res.status).toBe(201);
      expect(res.body.message).toBe('Deposit successful');
      expect(res.body).toHaveProperty('transactionId');
    });

    it('should reject negative amount', async () => {
      const res = await request(app)
        .post('/deposits')
        .send({
          accountId: accountId1,
          amount: -100
        });

      expect(res.status).toBe(400);
    });

    it('should reject invalid UUID', async () => {
      const res = await request(app)
        .post('/deposits')
        .send({
          accountId: 'not-a-uuid',
          amount: 100
        });

      expect(res.status).toBe(400);
    });

    it('should reject zero amount', async () => {
      const res = await request(app)
        .post('/deposits')
        .send({
          accountId: accountId1,
          amount: 0
        });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /accounts/:id', () => {
    it('should return account with balance', async () => {
      const res = await request(app).get(`/accounts/${accountId1}`);

      expect(res.status).toBe(200);
      expect(res.body.balance).toBe('1000.50');
      expect(res.body.id).toBe(accountId1);
    });

    it('should return 404 for non-existent account', async () => {
      const fakeId = '123e4567-e89b-12d3-a456-426614174999';
      const res = await request(app).get(`/accounts/${fakeId}`);

      expect(res.status).toBe(404);
    });

    it('should reject invalid UUID format', async () => {
      const res = await request(app).get('/accounts/invalid-id');

      expect(res.status).toBe(400);
    });
  });

  describe('POST /withdrawals', () => {
    it('should create a withdrawal', async () => {
      const res = await request(app)
        .post('/withdrawals')
        .send({
          accountId: accountId1,
          amount: 200.25,
          description: 'ATM withdrawal'
        });

      expect(res.status).toBe(201);
      expect(res.body.message).toBe('Withdrawal successful');
    });

    it('should reject withdrawal exceeding balance', async () => {
      const res = await request(app)
        .post('/withdrawals')
        .send({
          accountId: accountId1,
          amount: 10000
        });

      expect(res.status).toBe(422);
      expect(res.body.error).toBe('Insufficient funds');
    });
  });

  describe('POST /transfers', () => {
    beforeAll(async () => {
      // Create second account
      const res = await request(app)
        .post('/accounts')
        .send({
          userId: '223e4567-e89b-12d3-a456-426614174000',
          accountType: 'SAVINGS',
          currency: 'USD'
        });
      accountId2 = res.body.id;
    });

    it('should create a transfer', async () => {
      const res = await request(app)
        .post('/transfers')
        .send({
          sourceAccountId: accountId1,
          destinationAccountId: accountId2,
          amount: 300.00,
          description: 'Transfer to savings'
        });

      expect(res.status).toBe(201);
      expect(res.body.message).toBe('Transfer successful');
    });

    it('should reject transfer to same account', async () => {
      const res = await request(app)
        .post('/transfers')
        .send({
          sourceAccountId: accountId1,
          destinationAccountId: accountId1,
          amount: 100
        });

      expect(res.status).toBe(400);
    });

    it('should reject transfer with insufficient funds', async () => {
      const res = await request(app)
        .post('/transfers')
        .send({
          sourceAccountId: accountId1,
          destinationAccountId: accountId2,
          amount: 10000
        });

      expect(res.status).toBe(422);
    });

    it('should verify balances after transfer', async () => {
      const res1 = await request(app).get(`/accounts/${accountId1}`);
      const res2 = await request(app).get(`/accounts/${accountId2}`);

      expect(res1.body.balance).toBe('500.25'); // 1000.50 - 200.25 - 300
      expect(res2.body.balance).toBe('300.00');
    });
  });

  describe('GET /accounts/:id/ledger', () => {
    it('should return ledger entries', async () => {
      const res = await request(app).get(`/accounts/${accountId1}/ledger`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
    });

    it('should return 404 for non-existent account', async () => {
      const fakeId = '123e4567-e89b-12d3-a456-426614174999';
      const res = await request(app).get(`/accounts/${fakeId}/ledger`);

      expect(res.status).toBe(404);
    });
  });

  describe('Health Check', () => {
    it('should return health status', async () => {
      const res = await request(app).get('/health');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
    });
  });

  describe('Error Handling', () => {
    it('should return 404 for non-existent route', async () => {
      const res = await request(app).get('/nonexistent');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Route not found');
    });
  });
});

const express = require("express");
const router = express.Router();
const accountController = require("../controllers/account.controller");
const { validate, createAccountSchema, accountIdSchema } = require("../utils/validators");

/**
 * Account Routes
 */

// POST /accounts - Create a new account
router.post(
  "/",
  validate(createAccountSchema),
  accountController.createAccount
);

// GET /accounts/:id - Get account with balance
router.get(
  "/:id",
  validate(accountIdSchema, 'params'),
  accountController.getAccount
);

// GET /accounts/:id/ledger - Get account ledger entries
router.get(
  "/:id/ledger",
  validate(accountIdSchema, 'params'),
  accountController.getAccountLedger
);

module.exports = router;

const express = require("express");
const router = express.Router();
const transactionController = require("../controllers/transaction.controller");
const { validate, transactionAmountSchema, transferSchema } = require("../utils/validators");

/**
 * Transaction Routes
 */

// POST /deposits - Process a deposit
router.post(
  "/deposits",
  validate(transactionAmountSchema),
  transactionController.deposit
);

// POST /withdrawals - Process a withdrawal
router.post(
  "/withdrawals",
  validate(transactionAmountSchema),
  transactionController.withdrawal
);

// POST /transfers - Process a transfer
router.post(
  "/transfers",
  validate(transferSchema),
  transactionController.transfer
);

module.exports = router;

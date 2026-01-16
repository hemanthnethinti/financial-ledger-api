const depositService = require("../services/deposit.service");
const withdrawalService = require("../services/withdrawal.service");
const transferService = require("../services/transfer.service");
const { asyncHandler, AppError } = require("../middleware/errorHandler");

/**
 * Transaction Controller - Handles transaction-related HTTP requests
 */

const deposit = asyncHandler(async (req, res) => {
  const { accountId, amount, description } = req.body;
  const result = await depositService.processDeposit(accountId, amount, description);
  res.status(201).json(result);
});

const withdrawal = asyncHandler(async (req, res) => {
  const { accountId, amount, description } = req.body;
  const result = await withdrawalService.processWithdrawal(accountId, amount, description);
  res.status(201).json(result);
});

const transfer = asyncHandler(async (req, res) => {
  const { sourceAccountId, destinationAccountId, amount, description } = req.body;
  
  if (sourceAccountId === destinationAccountId) {
    throw new AppError('Cannot transfer to the same account', 400);
  }
  
  const result = await transferService.processTransfer(
    sourceAccountId,
    destinationAccountId,
    amount,
    description
  );
  res.status(201).json(result);
});

module.exports = {
  deposit,
  withdrawal,
  transfer,
};

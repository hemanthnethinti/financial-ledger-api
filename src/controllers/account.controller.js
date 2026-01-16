const accountService = require("../services/account.service");
const { asyncHandler, AppError } = require("../middleware/errorHandler");

/**
 * Account Controller - Handles account-related HTTP requests
 */

const createAccount = asyncHandler(async (req, res) => {
  const { userId, accountType, currency } = req.body;
  const account = await accountService.createAccount(userId, accountType, currency);
  res.status(201).json(account);
});

const getAccount = asyncHandler(async (req, res) => {
  const accountId = req.params.id;
  const result = await accountService.getAccountWithBalance(accountId);
  
  if (!result) {
    throw new AppError('Account not found', 404);
  }
  
  res.status(200).json(result);
});

const getAccountLedger = asyncHandler(async (req, res) => {
  const accountId = req.params.id;
  const ledger = await accountService.getAccountLedger(accountId);
  res.status(200).json(ledger);
});

module.exports = {
  createAccount,
  getAccount,
  getAccountLedger,
};

const Joi = require('joi');

/**
 * Validation middleware using Joi - Handles input validation for all requests
 */

// Allowed values
const ACCOUNT_TYPES = ['SAVINGS', 'CHECKING', 'INVESTMENT'];
const CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF'];

// Account creation schema
const createAccountSchema = Joi.object({
  userId: Joi.string().uuid().required(),
  accountType: Joi.string().valid(...ACCOUNT_TYPES).required(),
  currency: Joi.string().valid(...CURRENCIES).required()
});

// Account ID parameter schema
const accountIdSchema = Joi.object({
  id: Joi.string().uuid().required()
});

// Deposit/Withdrawal schema
const transactionAmountSchema = Joi.object({
  accountId: Joi.string().uuid().required(),
  amount: Joi.number().positive().precision(2).required(),
  description: Joi.string().max(500).optional().allow('')
});

// Transfer schema
const transferSchema = Joi.object({
  sourceAccountId: Joi.string().uuid().required(),
  destinationAccountId: Joi.string().uuid().required()
    .invalid(Joi.ref('sourceAccountId'))
    .messages({
      'any.invalid': 'Source and destination accounts cannot be the same'
    }),
  amount: Joi.number().positive().precision(2).required(),
  description: Joi.string().max(500).optional().allow('')
});

/**
 * Validation middleware factory
 */
const validate = (schema, property = 'body') => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[property], {
      abortEarly: false,
      stripUnknown: true
    });

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }));
      
      return res.status(400).json({
        error: 'Validation failed',
        details: errors
      });
    }

    req[property] = value;
    next();
  };
};

module.exports = {
  validate,
  createAccountSchema,
  accountIdSchema,
  transactionAmountSchema,
  transferSchema,
  ACCOUNT_TYPES,
  CURRENCIES
};

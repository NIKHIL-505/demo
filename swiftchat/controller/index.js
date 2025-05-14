'use strict';

const httpStatus = require('http-status');
const service = require('../service');
const logger = require('../../utils/logger');

const klusterWebhook = async (req, res, next) => {
  try {
    // res.sendStatus(httpStatus.OK); // use fast return in production
    const userMobile = req.body.from;
    logger.info({
      userMobile,
      message: 'SwiftChat Message Received',
      requestBody: req.body,
    });
    let userMessage;
    let messageType = req.body.type;
    if (messageType === 'text') {
      userMessage = req.body.text.body;
    } else if (messageType === 'persistent_menu_response') {
      userMessage = (req.body.persistent_menu_response.id - 1).toString();
    } else if (messageType === 'button_response') {
      userMessage = (req.body.button_response.button_index + 1).toString();
    } else if (messageType === 'multi_select_button_response') {
      userMessage = req.body.multi_select_button_response.map(
        (button) => button.button_index + 1
      );
    } else if (messageType === 'location') {
      userMessage = req.body.location;
    }

    await service.klusterWebhook(userMobile, userMessage, messageType, req.body);
    res.sendStatus(httpStatus.OK);
  } catch (e) {
    console.log(e);
    logger.error({
      userMobile: req.body.from,
      message: 'SwiftChat Webhook Error',
      requestBody: req.body,
      error: e,
    });
    return next(e);
  }
};

const messageWebhookTest = async (req, res) => {
  logger.info({
    message: 'Test Webhook Request received',
    requestBody: req.body,
    requestHeaders: req.headers,
  });
};

const triviaQuestions = async (req, res, next) => {
  try {
    const { category, difficulty } = req.body;
    if (!category || !difficulty) {
      return res.status(400).json({ error: 'category and difficulty are required' });
    }
    const questions = await service.fetchTriviaQuestions(category, difficulty);
    res.json({ questions });
  } catch (e) {
    next(e);
  }
};

module.exports = {
  klusterWebhook,
  messageWebhookTest,
  triviaQuestions, // Add this to exports
};

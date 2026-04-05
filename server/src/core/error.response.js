'use strict';

const statusCodes = require('./statusCodes');
const reasonPhrases = require('./reasonPhrases');

/** Lỗi HTTP tùy chỉnh (message + statusCode). */
class ErrorResponse extends Error {
    constructor(message, statusCode) {
        super(message);
        this.statusCode = statusCode;
    }
}

class ConflictRequestError extends ErrorResponse {
    constructor(message = reasonPhrases.CONFLICT, statusCode = statusCodes.CONFLICT) {
        super(message, statusCode);
    }
}

class BadRequestError extends ErrorResponse {
    constructor(message = reasonPhrases.BAD_REQUEST, statusCode = statusCodes.BAD_REQUEST) {
        super(message, statusCode);
    }
}

class AuthFailureError extends ErrorResponse {
    constructor(message = reasonPhrases.UNAUTHORIZED, statusCode = statusCodes.UNAUTHORIZED) {
        super(message, statusCode);
    }
}

class NotFoundError extends ErrorResponse {
    constructor(message = reasonPhrases.NOT_FOUND, statusCode = statusCodes.NOT_FOUND) {
        super(message, statusCode);
    }
}

class ForbiddenError extends ErrorResponse {
    constructor(message = reasonPhrases.FORBIDDEN, statusCode = statusCodes.FORBIDDEN) {
        super(message, statusCode);
    }
}

class InternalServerError extends ErrorResponse {
    constructor(message = reasonPhrases.INTERNAL_SERVER_ERROR, statusCode = statusCodes.INTERNAL_SERVER_ERROR) {
        super(message, statusCode);
    }
}

class BadGatewayError extends ErrorResponse {
    constructor(message = reasonPhrases.BAD_GATEWAY, statusCode = statusCodes.BAD_GATEWAY) {
        super(message, statusCode);
    }
}

class ServiceUnavailableError extends ErrorResponse {
    constructor(message = reasonPhrases.SERVICE_UNAVAILABLE, statusCode = statusCodes.SERVICE_UNAVAILABLE) {
        super(message, statusCode);
    }
}

class UnprocessableEntityError extends ErrorResponse {
    constructor(message = reasonPhrases.UNPROCESSABLE_ENTITY, statusCode = statusCodes.UNPROCESSABLE_ENTITY) {
        super(message, statusCode);
    }
}

class TooManyRequestsError extends ErrorResponse {
    constructor(message = reasonPhrases.TOO_MANY_REQUESTS, statusCode = statusCodes.TOO_MANY_REQUESTS) {
        super(message, statusCode);
    }
}

module.exports = {
    ErrorResponse,
    ConflictRequestError,
    BadRequestError,
    AuthFailureError,
    NotFoundError,
    ForbiddenError,
    InternalServerError,
    BadGatewayError,
    ServiceUnavailableError,
    UnprocessableEntityError,
    TooManyRequestsError,
};

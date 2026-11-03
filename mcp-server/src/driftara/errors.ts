/** Typed driftara errors; `code` is the envelope `code` (same vocabulary as vexlum). */
export class DriftaraError extends Error {
    readonly code: string;
    readonly details: Record<string, unknown>;

    constructor(code: string, message: string, details: Record<string, unknown> = {}) {
        super(message);
        this.code = code;
        this.details = details;
    }
}

export class ConfirmationRequiredError extends DriftaraError {
    constructor(message: string, details: Record<string, unknown> = {}) {
        super("confirmation_required", message, details);
    }
}

export class PolicyError extends DriftaraError {
    constructor(message: string, details: Record<string, unknown> = {}) {
        super("policy_rejected", message, details);
    }
}

export class ConfirmTokenError extends DriftaraError {
    constructor(message: string, details: Record<string, unknown> = {}) {
        super("confirm_token_invalid", message, details);
    }
}

export class ValidationError extends DriftaraError {
    constructor(message: string, details: Record<string, unknown> = {}) {
        super("validation_error", message, details);
    }
}

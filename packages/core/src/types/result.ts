/**
 * Result Type Definitions
 *
 * Functional error handling pattern.
 * Use Result<T, E> instead of throwing exceptions for expected errors.
 */

import type { IceError } from './errors.js';

// =============================================================================
// Core Result Type
// =============================================================================

/**
 * Discriminated union for success/failure results.
 */
export type Result<T, E = IceError> = Success<T> | Failure<E>;

/**
 * Successful result containing a value.
 */
export interface Success<T> {
  readonly ok: true;
  readonly value: T;
}

/**
 * Failed result containing an error.
 */
export interface Failure<E> {
  readonly ok: false;
  readonly error: E;
}

// =============================================================================
// Result Constructors
// =============================================================================

/**
 * Create a successful result.
 */
export function success<T>(value: T): Success<T> {
  return { ok: true, value };
}

/**
 * Create a failed result.
 */
export function failure<E>(error: E): Failure<E> {
  return { ok: false, error };
}

// =============================================================================
// Type Guards
// =============================================================================

/**
 * Check if a result is successful.
 */
export function is_success<T, E>(result: Result<T, E>): result is Success<T> {
  return result.ok === true;
}

/**
 * Check if a result is a failure.
 */
export function is_failure<T, E>(result: Result<T, E>): result is Failure<E> {
  return result.ok === false;
}

// =============================================================================
// Result Operations
// =============================================================================

/**
 * Extract the value from a result, or return a default.
 */
export function unwrap_or<T, E>(result: Result<T, E>, default_value: T): T {
  return result.ok ? result.value : default_value;
}

/**
 * Extract the value from a result, or compute a default.
 */
export function unwrap_or_else<T, E>(result: Result<T, E>, fn: (error: E) => T): T {
  return result.ok ? result.value : fn(result.error);
}

/**
 * Extract the value from a result, or throw the error.
 */
export function unwrap<T, E extends Error>(result: Result<T, E>): T {
  if (result.ok) {
    return result.value;
  }
  throw result.error;
}

/**
 * Extract the error from a result, or throw if success.
 */
export function unwrap_error<T, E>(result: Result<T, E>): E {
  if (!result.ok) {
    return result.error;
  }
  throw new Error('Called unwrap_error on a successful result');
}

// =============================================================================
// Result Transformations
// =============================================================================

/**
 * Transform a successful result's value.
 */
export function map<T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
  if (result.ok) {
    return success(fn(result.value));
  }
  return result;
}

/**
 * Transform a failed result's error.
 */
export function map_error<T, E, F>(result: Result<T, E>, fn: (error: E) => F): Result<T, F> {
  if (!result.ok) {
    return failure(fn(result.error));
  }
  return result;
}

/**
 * Chain result-returning operations.
 */
export function flat_map<T, U, E>(result: Result<T, E>, fn: (value: T) => Result<U, E>): Result<U, E> {
  if (result.ok) {
    return fn(result.value);
  }
  return result;
}

/**
 * Recover from a failure by trying an alternative.
 */
export function or_else<T, E, F>(result: Result<T, E>, fn: (error: E) => Result<T, F>): Result<T, F> {
  if (!result.ok) {
    return fn(result.error);
  }
  return result;
}

// =============================================================================
// Result Combinators
// =============================================================================

/**
 * Combine multiple results into a single result containing an array.
 * Returns the first failure encountered, or success with all values.
 */
export function all<T, E>(results: Result<T, E>[]): Result<T[], E> {
  const values: T[] = [];

  for (const result of results) {
    if (!result.ok) {
      return result;
    }
    values.push(result.value);
  }

  return success(values);
}

/**
 * Return the first successful result, or the last failure.
 */
export function any<T, E>(results: Result<T, E>[]): Result<T, E> {
  let last_error: Failure<E> | null = null;

  for (const result of results) {
    if (result.ok) {
      return result;
    }
    last_error = result;
  }

  if (last_error) {
    return last_error;
  }

  throw new Error('Cannot call any() with empty array');
}

/**
 * Partition results into successes and failures.
 */
export function partition<T, E>(results: Result<T, E>[]): { successes: T[]; failures: E[] } {
  const successes: T[] = [];
  const failures: E[] = [];

  for (const result of results) {
    if (result.ok) {
      successes.push(result.value);
    } else {
      failures.push(result.error);
    }
  }

  return { successes, failures };
}

// =============================================================================
// Async Result Helpers
// =============================================================================

/**
 * Wrap a promise that may throw into a Result.
 */
export async function from_promise<T, E = Error>(
  promise: Promise<T>,
  error_mapper?: (error: unknown) => E,
): Promise<Result<T, E>> {
  try {
    const value = await promise;
    return success(value);
  } catch (error) {
    if (error_mapper) {
      return failure(error_mapper(error));
    }
    return failure(error as E);
  }
}

/**
 * Wrap a function that may throw into a Result.
 */
export function from_try<T, E = Error>(fn: () => T, error_mapper?: (error: unknown) => E): Result<T, E> {
  try {
    const value = fn();
    return success(value);
  } catch (error) {
    if (error_mapper) {
      return failure(error_mapper(error));
    }
    return failure(error as E);
  }
}

/**
 * Convert a nullable value to a Result.
 */
export function from_nullable<T, E>(value: T | null | undefined, error: E): Result<T, E> {
  if (value === null || value === undefined) {
    return failure(error);
  }
  return success(value);
}

// =============================================================================
// Result Type Aliases
// =============================================================================

/**
 * Result with IceError as the error type.
 */
export type IceResult<T> = Result<T, IceError>;

/**
 * Async result with IceError.
 */
export type AsyncIceResult<T> = Promise<IceResult<T>>;

/**
 * Result that can contain multiple errors.
 */
export type MultiResult<T, E = IceError> = Result<T, E[]>;

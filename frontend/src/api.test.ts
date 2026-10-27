import { describe, expect, it } from 'vitest';
import { extractErrorMessage } from './api';

describe('api.ts extractErrorMessage', () => {
  it('extracts standard FastAPI string detail error', () => {
    const body = { detail: 'Interval not found' };
    expect(extractErrorMessage(body, 404, 'Not Found')).toBe('Interval not found');
  });

  it('extracts FastAPI 422 validation array error', () => {
    const body = {
      detail: [
        { loc: ['query', 'cutoff'], msg: 'Input should be 15:30 or 09:50', type: 'value_error' },
      ],
    };
    expect(extractErrorMessage(body, 422, 'Unprocessable Entity')).toBe('Input should be 15:30 or 09:50');
  });

  it('extracts nested error object detail.error.message', () => {
    const body = {
      detail: {
        error: { message: 'Snapshot file missing from server disk' },
      },
    };
    expect(extractErrorMessage(body, 503, 'Service Unavailable')).toBe(
      'Snapshot file missing from server disk',
    );
  });

  it('extracts top-level error.message', () => {
    const body = {
      error: { message: 'Gateway timeout while fetching forecast' },
    };
    expect(extractErrorMessage(body, 504, 'Gateway Timeout')).toBe(
      'Gateway timeout while fetching forecast',
    );
  });

  it('extracts top-level message string', () => {
    const body = { message: 'Custom service message' };
    expect(extractErrorMessage(body, 500, 'Internal Server Error')).toBe('Custom service message');
  });

  it('handles empty or non-object body with fallback status', () => {
    expect(extractErrorMessage(null, 502, 'Bad Gateway')).toBe('HTTP 502 (Bad Gateway)');
    expect(extractErrorMessage({}, 500, 'Internal Server Error')).toBe('HTTP 500 (Internal Server Error)');
  });
});

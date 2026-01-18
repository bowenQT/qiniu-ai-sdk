/**
 * Tests for partial JSON parser.
 */

import { describe, it, expect } from 'vitest';
import { PartialJsonParser, parsePartialJson } from '../../../src/lib/partial-json-parser';

describe('PartialJsonParser', () => {
    describe('parseComplete', () => {
        it('should parse complete JSON', () => {
            const parser = new PartialJsonParser();
            parser.append('{"name": "test", "value": 123}');

            const result = parser.parseComplete();
            expect(result.complete).toBe(true);
            expect(result.value).toEqual({ name: 'test', value: 123 });
        });

        it('should return incomplete for partial JSON', () => {
            const parser = new PartialJsonParser();
            parser.append('{"name": "test"');

            const result = parser.parseComplete();
            expect(result.complete).toBe(false);
            expect(result.value).toBeNull();
        });
    });

    describe('parsePartial', () => {
        it('should complete partial object', () => {
            const parser = new PartialJsonParser();
            parser.append('{"name": "test"');

            const result = parser.parsePartial<{ name: string }>();
            expect(result.complete).toBe(false);
            expect(result.value).toEqual({ name: 'test' });
        });

        it('should complete partial array', () => {
            const parser = new PartialJsonParser();
            parser.append('[1, 2, 3');

            const result = parser.parsePartial<number[]>();
            expect(result.complete).toBe(false);
            expect(result.value).toEqual([1, 2, 3]);
        });

        it('should complete nested object', () => {
            const parser = new PartialJsonParser();
            parser.append('{"outer": {"inner": "value"');

            const result = parser.parsePartial<{ outer: { inner: string } }>();
            expect(result.complete).toBe(false);
            expect(result.value).toEqual({ outer: { inner: 'value' } });
        });

        it('should handle incomplete string', () => {
            const parser = new PartialJsonParser();
            parser.append('{"name": "incom');

            const result = parser.parsePartial();
            expect(result.complete).toBe(false);
            expect(result.value).toEqual({ name: 'incom' });
        });

        it('should accumulate chunks', () => {
            const parser = new PartialJsonParser();

            parser.append('{"tit');
            let result = parser.parsePartial();
            // First chunk may be incomplete, value might be null or partial
            expect(result.complete).toBe(false);

            parser.append('le": "Hello');
            result = parser.parsePartial();
            expect(result.complete).toBe(false);
            expect(result.value).toEqual({ title: 'Hello' });

            parser.append('", "done": true}');
            result = parser.parsePartial();
            expect(result.complete).toBe(true);
            expect(result.value).toEqual({ title: 'Hello', done: true });
        });
    });

    describe('reset', () => {
        it('should clear buffer on reset', () => {
            const parser = new PartialJsonParser();
            parser.append('{"name": "test"}');
            parser.reset();

            expect(parser.getBuffer()).toBe('');
        });
    });
});

describe('parsePartialJson', () => {
    it('should parse partial JSON in one call', () => {
        const result = parsePartialJson<{ name: string }>('{"name": "test"');
        expect(result.complete).toBe(false);
        expect(result.value).toEqual({ name: 'test' });
    });

    it('should parse complete JSON in one call', () => {
        const result = parsePartialJson<{ name: string }>('{"name": "test"}');
        expect(result.complete).toBe(true);
        expect(result.value).toEqual({ name: 'test' });
    });
});

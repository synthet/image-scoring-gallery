import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DatabaseConfig } from '../types';
import {
    createDatabaseConnector,
    ApiConnector,
    FirebirdConnector,
    PostgresConnector,
    sqlQuestionMarksToPgNumbered,
} from './provider';

// Mock fetch for ApiConnector
global.fetch = vi.fn();

describe('sqlQuestionMarksToPgNumbered', () => {
    it('maps ? to $1 $2 outside quotes', () => {
        const { text, count } = sqlQuestionMarksToPgNumbered('SELECT * FROM t WHERE a = ? AND b = ?');
        expect(text).toBe('SELECT * FROM t WHERE a = $1 AND b = $2');
        expect(count).toBe(2);
    });
    it('ignores ? inside single-quoted strings', () => {
        const { text, count } = sqlQuestionMarksToPgNumbered("SELECT ? AS x WHERE y = 'a?b'");
        expect(count).toBe(1);
        expect(text).toBe("SELECT $1 AS x WHERE y = 'a?b'");
    });
    it('handles SQL escaped quotes (\'\') inside strings', () => {
        const { text, count } = sqlQuestionMarksToPgNumbered(
            "SELECT ? FROM t WHERE c = 'a''?'"
        );
        expect(count).toBe(1);
        expect(text).toBe("SELECT $1 FROM t WHERE c = 'a''?'");
    });
});

describe('Database Connector Abstraction', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('createDatabaseConnector', () => {
        it('should create an ApiConnector when engine is "api"', () => {
            const config = {
                dbConfig: { engine: 'api', api: { url: 'http://test-backend:7860' } },
                firebirdDatabasePath: 'test.fdb'
            };
            const connector = createDatabaseConnector(
                config as { dbConfig: DatabaseConfig; firebirdDatabasePath: string }
            );
            expect(connector).toBeInstanceOf(ApiConnector);
            expect(connector.type).toBe('api');
        });

        it('should create a FirebirdConnector by default', () => {
            const config = {
                dbConfig: { engine: 'firebird' },
                firebirdDatabasePath: 'test.fdb'
            };
            const connector = createDatabaseConnector(
                config as { dbConfig: DatabaseConfig; firebirdDatabasePath: string }
            );
            expect(connector).toBeInstanceOf(FirebirdConnector);
            expect(connector.type).toBe('firebird');
        });

        it('should create a PostgresConnector when engine is "postgres"', () => {
            const config = {
                dbConfig: { engine: 'postgres', postgres: { host: 'localhost', port: 5432, database: 'test', user: 'user' } },
                firebirdDatabasePath: 'test.fdb'
            };
            const connector = createDatabaseConnector(
                config as { dbConfig: DatabaseConfig; firebirdDatabasePath: string }
            );
            expect(connector).toBeInstanceOf(PostgresConnector);
            expect(connector.type).toBe('postgres');
        });
    });

    describe('ApiConnector', () => {
        const apiUrl = 'http://localhost:7860';
        const connector = new ApiConnector(apiUrl);

        it('should query via API', async () => {
            const mockData = { data: [{ id: 1, name: 'test' }] };
            (global.fetch as any).mockResolvedValue({
                ok: true,
                json: () => Promise.resolve(mockData)
            });

            const result = await connector.query('SELECT * FROM images', [1]);
            
            expect(global.fetch).toHaveBeenCalledWith(
                `${apiUrl}/api/db/query`,
                expect.objectContaining({
                    method: 'POST',
                    body: JSON.stringify({ sql: 'SELECT * FROM images', params: [1] })
                })
            );
            expect(result).toEqual(mockData.data);
        });

        it('should accept { rows: [...] } responses', async () => {
            const mockData = { rows: [{ id: 2 }] };
            (global.fetch as any).mockResolvedValue({
                ok: true,
                json: () => Promise.resolve(mockData)
            });
            const result = await connector.query('SELECT 1', []);
            expect(result).toEqual(mockData.rows);
        });

        it('should throw error on API failure', async () => {
            (global.fetch as any).mockResolvedValue({
                ok: false,
                status: 500,
                text: () => Promise.resolve('Internal Error')
            });

            await expect(connector.query('SELECT 1')).rejects.toThrow('API Query failed (500): Internal Error');
        });

        it('should verify startup via health check', async () => {
            (global.fetch as any).mockResolvedValue({ ok: true });
            const ready = await connector.verifyStartup();
            expect(ready).toBe(true);
            expect(global.fetch).toHaveBeenCalledWith(`${apiUrl}/api/health`, expect.anything());
        });
    });
});

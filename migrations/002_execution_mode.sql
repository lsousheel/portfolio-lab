ALTER TABLE executions ADD COLUMN execution_mode VARCHAR(30) NOT NULL DEFAULT 'strict', ADD COLUMN quote_provider VARCHAR(40) NOT NULL DEFAULT 'legacy';

CREATE DATABASE IF NOT EXISTS pf;
CREATE DATABASE IF NOT EXISTS pf_test;
CREATE USER IF NOT EXISTS 'pf'@'localhost' IDENTIFIED BY 'local-demo-only';
GRANT ALL ON pf.* TO 'pf'@'localhost';
GRANT ALL ON pf_test.* TO 'pf'@'localhost';
ALTER USER 'root'@'localhost' IDENTIFIED BY 'isolated-local-admin-only';

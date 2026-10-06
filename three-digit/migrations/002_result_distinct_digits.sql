-- 002_result_distinct_digits.sql
-- Owner rule (6 Oct 2026): a six-digit result never repeats a digit.
-- Enforced for every NEW result version (historical rows are left untouched).
CREATE TRIGGER result_versions_distinct_digits BEFORE INSERT ON result_versions
WHEN (SELECT count(*) FROM (
        SELECT substr(NEW.six_digit_result, 1, 1) UNION SELECT substr(NEW.six_digit_result, 2, 1)
  UNION SELECT substr(NEW.six_digit_result, 3, 1) UNION SELECT substr(NEW.six_digit_result, 4, 1)
  UNION SELECT substr(NEW.six_digit_result, 5, 1) UNION SELECT substr(NEW.six_digit_result, 6, 1))) <> 6
BEGIN SELECT RAISE(ABORT, 'result digits must all be different'); END;

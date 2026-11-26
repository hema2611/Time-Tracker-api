-- Blood group is now stored as the short code (A+, A1B-, O+ ...). Convert the old "+ve" / "-ve" values.
UPDATE employees SET blood_group = REPLACE(blood_group, '+ve', '+') WHERE blood_group LIKE '%+ve';
UPDATE employees SET blood_group = REPLACE(blood_group, '-ve', '-') WHERE blood_group LIKE '%-ve';

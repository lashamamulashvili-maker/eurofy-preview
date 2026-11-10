-- Optional starter categories. Run after schema.sql in a dedicated EUROFY database.
INSERT INTO categories(name_ka,slug) VALUES
('სახლი','home'),
('მოდა','fashion'),
('ელექტრონიკა','electronics'),
('აქსესუარები','accessories')
ON CONFLICT (slug) DO NOTHING;
-- No demonstration products are seeded into the real database.

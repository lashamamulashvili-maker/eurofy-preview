-- EUROFY starter catalog categories. Run after schema.sql.
-- Existing categories are preserved. No real products are seeded.
INSERT INTO categories(name_ka,slug) VALUES
('სახლი და ინტერიერი','home'),
('მოდა და ტანსაცმელი','fashion'),
('ელექტრონიკა','electronics'),
('აქსესუარები','accessories'),
('ფეხსაცმელი','shoes'),
('სილამაზე და მოვლა','beauty'),
('ჯანმრთელობა და ჰიგიენა','health'),
('ბავშვები და სათამაშოები','kids'),
('სპორტი და ფიტნესი','sports'),
('ავტომობილი და აქსესუარები','automotive'),
('სამზარეულო და ტექნიკა','kitchen'),
('ავეჯი','furniture'),
('ბაღი და ეზო','garden'),
('ინსტრუმენტები და რემონტი','tools'),
('წიგნები და საკანცელარიო','books'),
('ცხოველების ნივთები','pets'),
('სამგზავრო ნივთები','travel'),
('საათები და სამკაულები','watches-jewelry'),
('კომპიუტერები და აქსესუარები','computers'),
('ტელეფონები და აქსესუარები','phones')
ON CONFLICT (slug) DO UPDATE SET name_ka=EXCLUDED.name_ka;

-- Additive category and supplier-import preparation. No supplier data is fabricated.
ALTER TABLE categories ADD COLUMN IF NOT EXISTS name_en text;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS name_uk text;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS description_ka text NOT NULL DEFAULT '';
ALTER TABLE categories ADD COLUMN IF NOT EXISTS description_en text NOT NULL DEFAULT '';
ALTER TABLE categories ADD COLUMN IF NOT EXISTS description_uk text NOT NULL DEFAULT '';
ALTER TABLE categories ADD COLUMN IF NOT EXISTS display_order integer NOT NULL DEFAULT 0;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS is_published boolean NOT NULL DEFAULT true;
CREATE TABLE IF NOT EXISTS eurofy_subcategories (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 category_id uuid NOT NULL REFERENCES categories(id),
 slug text NOT NULL UNIQUE,
 name_ka text NOT NULL,
 name_en text NOT NULL,
 name_uk text NOT NULL,
 description_ka text NOT NULL DEFAULT '',
 description_en text NOT NULL DEFAULT '',
 description_uk text NOT NULL DEFAULT '',
 display_order integer NOT NULL DEFAULT 0,
 is_published boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE products ADD COLUMN IF NOT EXISTS subcategory_id uuid REFERENCES eurofy_subcategories(id);
CREATE INDEX IF NOT EXISTS eurofy_subcategories_category_order_idx ON eurofy_subcategories(category_id,display_order);
CREATE INDEX IF NOT EXISTS products_subcategory_active_idx ON products(subcategory_id,is_active);
CREATE TABLE IF NOT EXISTS eurofy_supplier_category_mappings (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 supplier_id uuid NOT NULL REFERENCES eurofy_suppliers(id),
 external_category_id text NOT NULL,
 external_category_name text NOT NULL,
 category_id uuid REFERENCES categories(id),
 subcategory_id uuid REFERENCES eurofy_subcategories(id),
 status text NOT NULL DEFAULT 'unmapped' CHECK(status IN ('unmapped','mapped','rejected')),
 reviewed_by uuid REFERENCES users(id),
 reviewed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(supplier_id,external_category_id)
);
CREATE INDEX IF NOT EXISTS eurofy_supplier_category_review_idx ON eurofy_supplier_category_mappings(status,supplier_id);

INSERT INTO categories(name_ka,slug,name_en,name_uk,display_order) VALUES
('მოდა','fashion','Fashion','Мода',1),
('სახლი და ბაღი','home-garden','Home & Garden','Дім і сад',2),
('ჯანმრთელობა და სილამაზე','health-beauty','Health & Beauty','Здоров’я та краса',3),
('სათამაშოები და ჰობი','toys-hobbies','Toys & Hobbies','Іграшки та хобі',4),
('დედა და ბავშვი','mother-kids','Mother & Kids','Мама та діти',5),
('ეკოლოგიური პროდუქტები','eco-friendly','Eco-friendly','Екотовари',6),
('ავეჯი','furniture','Furniture','Меблі',7),
('შინაური ცხოველები','pet-supplies','Pet Supplies','Товари для тварин',8),
('საკვები და სასმელი','food-drink','Food & Drink','Їжа та напої',9),
('საჩუქრები და გაჯეტები','gifts-gadgets','Gifts & Gadgets','Подарунки та гаджети',10),
('სპორტი და გართობა','sports-entertainment','Sports & Entertainment','Спорт і розваги',11),
('მობილური ტელეფონები და აქსესუარები','mobile-accessories','Mobile Phones & Accessories','Мобільні телефони й аксесуари',12),
('ელექტრონიკა','electronics','Electronics','Електроніка',13),
('კომპიუტერი და ოფისი','computer-office','Computer & Office','Комп’ютери та офіс',14),
('ავტომობილები და მოტოციკლები','automotive-motorcycles','Automobiles & Motorcycles','Автомобілі та мотоцикли',15)
ON CONFLICT(slug) DO UPDATE SET name_en=EXCLUDED.name_en,name_uk=EXCLUDED.name_uk,display_order=EXCLUDED.display_order;

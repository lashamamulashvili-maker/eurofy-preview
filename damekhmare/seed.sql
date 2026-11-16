-- Demo categories; idempotent and safe for a dedicated local DAMEKHMARE database.
INSERT INTO dm_categories(slug,title_ka,title_en,title_ru) VALUES
('handyman','ხელოსანი','Handyman','Мастер'),
('electrician','ელექტრიკოსი','Electrician','Электрик'),
('plumber','სანტექნიკოსი','Plumber','Сантехник'),
('cleaning','დასუფთავება','Cleaning','Уборка'),
('it','კომპიუტერი და IT','Computer & IT','Компьютеры и IT'),
('painting','რემონტი და შეღებვა','Painting & repairs','Ремонт и покраска'),
('auto','ავტომომსახურება','Car services','Автоуслуги'),
('tutoring','რეპეტიტორი','Tutoring','Репетитор')
ON CONFLICT(slug) DO UPDATE SET title_ka=excluded.title_ka,title_en=excluded.title_en,title_ru=excluded.title_ru;

-- Catalogue de plans FasoFlow, sans comptes ou paiements démo.
insert into public.plans(audience,code,name,price_xof,interval,product_limit,features,is_active) values
('merchant','starter','Starter',0,'none',20,'["Boutique", "20 produits", "Gestion des commandes", "Messagerie"]'::jsonb,true),
('merchant','premium','Premium',5000,'month',200,'["200 produits", "Statistiques avancées", "Promotions", "Personnalisation de boutique"]'::jsonb,true),
('merchant','business','Business',15000,'month',1000,'["1 000 produits", "Rapports avancés", "Gestion avancée du stock", "Outils d’équipe à venir"]'::jsonb,true),
('courier','starter','Starter',0,'none',null,'["Profil livreur", "Demandes de livraison", "Messagerie", "Historique de base"]'::jsonb,true),
('courier','premium','Premium',2000,'month',null,'["Statistiques de revenus", "Préférences de livraison", "Profil enrichi"]'::jsonb,true),
('courier','pro','Pro',5000,'month',null,'["Statistiques avancées", "Outils de disponibilité", "Options de visibilité supplémentaires"]'::jsonb,true)
on conflict(audience,code) do update set name=excluded.name,price_xof=excluded.price_xof,interval=excluded.interval,product_limit=excluded.product_limit,features=excluded.features,is_active=true;

insert into public.categories(name,slug,description,sort_order) values
('Mode & artisanat','mode-artisanat','Créations, textile et savoir-faire.',1),
('Maison','maison','Objets utiles et pièces qui ont une histoire.',2),
('Beauté & bien-être','beaute-bien-etre','Soins, beauté et bien-être.',3),
('Alimentation','alimentation','Produits et saveurs locales.',4)
on conflict(slug) do update set name=excluded.name,description=excluded.description,sort_order=excluded.sort_order,is_active=true;

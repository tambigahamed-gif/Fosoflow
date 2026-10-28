-- Catalogue de plans FasoFlow, sans comptes ou paiements démo.
-- Ne pas écraser des plans/catégories qui existeraient déjà dans le projet cible.
insert into public.plans(audience,code,name,price_xof,interval,product_limit,features,is_active) values
('merchant','starter','Starter',0,'none',20,'["Boutique", "20 produits", "Gestion des commandes", "Messagerie"]'::jsonb,true),
('merchant','premium','Premium',5000,'month',200,'["200 produits", "Statistiques avancées", "Promotions de produits (à venir)", "Personnalisation de boutique (à venir)"]'::jsonb,true),
('merchant','business','Business',15000,'month',1000,'["1 000 produits", "Rapports avancés (à venir)", "Gestion avancée du stock (à venir)", "Outils d’équipe (à venir)"]'::jsonb,true),
('courier','starter','Starter',0,'none',null,'["Profil livreur", "Demandes de livraison", "Messagerie", "Historique de base"]'::jsonb,true),
('courier','premium','Premium',2000,'month',null,'["Statistiques de revenus enregistrés", "Préférences de zone", "Profil enrichi (à venir)"]'::jsonb,true),
('courier','pro','Pro',5000,'month',null,'["Statistiques avancées", "Outils de disponibilité", "Options de visibilité supplémentaires (à venir)"]'::jsonb,true)
on conflict do nothing;

insert into public.categories(name,slug,description,sort_order) values
('Mode & artisanat','mode-artisanat','Créations, textile et savoir-faire.',1),
('Maison','maison','Objets utiles et pièces qui ont une histoire.',2),
('Beauté & bien-être','beaute-bien-etre','Soins, beauté et bien-être.',3),
('Alimentation','alimentation','Produits et saveurs locales.',4)
on conflict do nothing;

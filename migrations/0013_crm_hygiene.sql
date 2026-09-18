ALTER TABLE customers ADD COLUMN display_name_manual INTEGER NOT NULL DEFAULT 0 CHECK(display_name_manual IN (0,1));

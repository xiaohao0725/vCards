INSERT INTO users (username, password_hash) VALUES ('xiaohao0725', '$2b$10$2eJbbM1uFmmWyuHJSpetTeH1kduzhBfqF.z32ViRO282i6TIL2056') ON CONFLICT (username) DO NOTHING;

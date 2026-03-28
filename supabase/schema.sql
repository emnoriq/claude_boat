-- =============================================
-- 堅いレース.ai - Supabaseスキーマ
-- =============================================

-- レーステーブル
CREATE TABLE IF NOT EXISTS races (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  venue_code    VARCHAR(2)  NOT NULL,
  venue_name    VARCHAR(10) NOT NULL DEFAULT '',
  race_date     DATE        NOT NULL,
  race_number   SMALLINT    NOT NULL,
  start_time    VARCHAR(5),
  created_at    TIMESTAMPTZ DEFAULT now(),

  UNIQUE (venue_code, race_date, race_number)
);

-- 選手（出走表）テーブル
CREATE TABLE IF NOT EXISTS racers (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  race_id       UUID        NOT NULL REFERENCES races(id) ON DELETE CASCADE,
  boat_number   SMALLINT    NOT NULL,
  racer_name    VARCHAR(20) DEFAULT '',
  rank          VARCHAR(2)  NOT NULL,
  win_rate      NUMERIC(4,2),
  two_rate      NUMERIC(5,2),
  motor_rate    NUMERIC(5,2),
  boat_rate     NUMERIC(5,2),
  created_at    TIMESTAMPTZ DEFAULT now(),

  UNIQUE (race_id, boat_number)
);

-- レース結果テーブル（精度検証用）
CREATE TABLE IF NOT EXISTS race_results (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  race_id       UUID        NOT NULL REFERENCES races(id) ON DELETE CASCADE UNIQUE,
  first_place   SMALLINT,
  second_place  SMALLINT,
  third_place   SMALLINT,
  trifecta_payout INTEGER,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- =============================================
-- STEP 2: ユーザープロファイル
-- =============================================
CREATE TABLE IF NOT EXISTS profiles (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email         TEXT,
  plan          TEXT DEFAULT 'free' CHECK (plan IN ('free', 'premium')),
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  subscription_status TEXT DEFAULT 'inactive',
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- 新規ユーザー登録時に自動でプロファイル作成するトリガー
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (NEW.id, NEW.email);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =============================================
-- インデックス
-- =============================================
CREATE INDEX IF NOT EXISTS idx_races_venue_date ON races (venue_code, race_date);
CREATE INDEX IF NOT EXISTS idx_races_date ON races (race_date);
CREATE INDEX IF NOT EXISTS idx_racers_race_id ON racers (race_id);
CREATE INDEX IF NOT EXISTS idx_results_race_id ON race_results (race_id);

-- =============================================
-- RLS (Row Level Security)
-- =============================================
ALTER TABLE races ENABLE ROW LEVEL SECURITY;
ALTER TABLE racers ENABLE ROW LEVEL SECURITY;
ALTER TABLE race_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- races: 誰でも読める、誰でも書ける（APIサーバーからservice_roleで書く）
DROP POLICY IF EXISTS "races_public_read" ON races;
CREATE POLICY "races_public_read" ON races FOR SELECT USING (true);
DROP POLICY IF EXISTS "races_service_insert" ON races;
CREATE POLICY "races_service_insert" ON races FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "races_service_update" ON races;
CREATE POLICY "races_service_update" ON races FOR UPDATE USING (true);

-- racers
DROP POLICY IF EXISTS "racers_public_read" ON racers;
CREATE POLICY "racers_public_read" ON racers FOR SELECT USING (true);
DROP POLICY IF EXISTS "racers_service_insert" ON racers;
CREATE POLICY "racers_service_insert" ON racers FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "racers_service_update" ON racers;
CREATE POLICY "racers_service_update" ON racers FOR UPDATE USING (true);

-- race_results
DROP POLICY IF EXISTS "results_public_read" ON race_results;
CREATE POLICY "results_public_read" ON race_results FOR SELECT USING (true);
DROP POLICY IF EXISTS "results_service_insert" ON race_results;
CREATE POLICY "results_service_insert" ON race_results FOR INSERT WITH CHECK (true);

-- profiles: 本人のみ読み書き可
DROP POLICY IF EXISTS "profiles_self_read" ON profiles;
CREATE POLICY "profiles_self_read" ON profiles FOR SELECT USING (auth.uid() = id);
DROP POLICY IF EXISTS "profiles_self_update" ON profiles;
CREATE POLICY "profiles_self_update" ON profiles FOR UPDATE USING (auth.uid() = id);
DROP POLICY IF EXISTS "profiles_service_all" ON profiles;
CREATE POLICY "profiles_service_all" ON profiles FOR ALL USING (true);

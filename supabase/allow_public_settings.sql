
-- Use this SQL in your Supabase SQL Editor to allow users to see the payment keys they need:

DO $$
BEGIN
    -- 1. Enable RLS if not already enabled
    ALTER TABLE admin_settings ENABLE ROW LEVEL SECURITY;

    -- 2. Create policy for authenticated users to read ONLY public keys
    DROP POLICY IF EXISTS "Allow authenticated users to read public keys" ON admin_settings;
    CREATE POLICY "Allow authenticated users to read public keys"
    ON admin_settings
    FOR SELECT
    TO authenticated
    USING (
        "key" IN (
            'brandName',
            'brandLogo',
            'pixKey', 
            'pixMerchantName', 
            'pixCity', 
            'mpPublicKey'
        )
    );

    -- This will allow regular users to pay at "Meu Plano" while keeping the 
    -- mpSecretKey and other sensitive info hidden.
END $$;

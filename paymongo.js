// ── NORECO I ElectService — PayMongo Integration ─────────────────
import { supabase } from './supabase-config.js';

// ✅ TEST MODE KEYS
const PAYMONGO_SECRET_KEY = 'sk_test_h84fdSopWnMTNCdFuuYrHE7P';
const PAYMONGO_PUBLIC_KEY = 'pk_test_AQzgnsdjdW21TB8AYd6sGUev';

const PAYMONGO_BASE = 'https://api.paymongo.com/v1';

// Create Basic Auth Header
function makeAuthHeader(key) {
  return 'Basic ' + btoa(key + ':');
}

// ── 1. CREATE PAYMENT LINK ────────────────────────────────────────
export async function createPaymentLink({
  amountPHP,
  description,
  meterSN,
  billId,
  userEmail = '',
  userName = ''
}) {

  const amountCentavos = Math.round(amountPHP * 100);

  const payload = {
    data: {
      attributes: {
        amount: amountCentavos,
        currency: 'PHP',

        description:
          description || `NORECO I Bill - ${meterSN}`,

        remarks: `BillID:${billId} Meter:${meterSN}`,

        redirect: {
          success:
            `${window.location.origin}/bills.html?payment=success&billId=${billId}&meterSN=${meterSN}`,

          failed:
            `${window.location.origin}/bills.html?payment=failed&billId=${billId}&meterSN=${meterSN}`,
        }
      }
    }
  };

  // ✅ USE SECRET KEY HERE
  const response = await fetch(`${PAYMONGO_BASE}/links`, {
    method: 'POST',

    headers: {
      'Content-Type': 'application/json',
      'Authorization': makeAuthHeader(PAYMONGO_SECRET_KEY),
    },

    body: JSON.stringify(payload),
  });

  const data = await response.json();

  console.log('PayMongo Response:', data);

  if (!response.ok) {
    const detail =
      data?.errors?.[0]?.detail ||
      'Failed to create payment link';

    throw new Error(detail);
  }

  const linkId = data.data.id;

  const checkoutUrl =
    data.data.attributes.checkout_url;

  const refNo =
    data.data.attributes.reference_number;

  // Save to Supabase
  await savePaymentRecord({
    bill_id: billId,
    meter_sn: meterSN,
    amount_php: amountPHP,
    description,

    paymongo_link_id: linkId,
    paymongo_ref_no: refNo,
    checkout_url: checkoutUrl,

    status: 'pending',

    user_email: userEmail,
    user_name: userName,
  });

  return {
    checkoutUrl,
    linkId,
    refNo
  };
}

// ── 2. CHECK LINK STATUS ──────────────────────────────────────────
export async function checkLinkStatus(linkId) {

  // ✅ USE SECRET KEY HERE TOO
  const response = await fetch(
    `${PAYMONGO_BASE}/links/${linkId}`,
    {
      headers: {
        'Authorization': makeAuthHeader(PAYMONGO_SECRET_KEY),
      },
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error('Failed to fetch payment status.');
  }

  const attrs = data.data.attributes;

  return {
    status: attrs.status,
    amountPHP: attrs.amount / 100,
    payments: attrs.payments || [],
  };
}

// ── 3. VERIFY & MARK PAID ────────────────────────────────────────
export async function verifyAndMarkPaid(linkId) {

  try {

    const { status, payments } =
      await checkLinkStatus(linkId);

    if (status === 'paid') {

      const pm = payments[0] || {};

      await savePaymentRecord({
        paymongo_link_id: linkId,

        status: 'paid',

        paid_at: new Date().toISOString(),

        paymongo_payment_id: pm.id || null,

        payment_method:
          pm?.attributes?.source?.type || null,
      });

      return true;
    }

    await savePaymentRecord({
      paymongo_link_id: linkId,

      status:
        status === 'expired'
          ? 'expired'
          : 'failed',
    });

    return false;

  } catch (err) {

    console.error(
      'verifyAndMarkPaid error:',
      err
    );

    return false;
  }
}

// ── 4. SAVE PAYMENT RECORD ───────────────────────────────────────
export async function savePaymentRecord(record) {

  record.updated_at =
    new Date().toISOString();

  const { error } = await supabase
    .from('payments')
    .upsert(record, {
      onConflict: 'paymongo_link_id'
    });

  if (error) {
    console.error('Supabase save error:', error);

    throw new Error(
      'Failed to save payment: ' +
      error.message
    );
  }
}

// ── 5. GET PAYMENTS FOR METER ────────────────────────────────────
export async function getPaymentsForMeter(meterSN) {

  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .eq('meter_sn', meterSN)
    .order('created_at', {
      ascending: false
    });

  if (error) {
    console.error(
      'Supabase fetch error:',
      error
    );

    return [];
  }

  return data || [];
}

// ── 6. CHECK PAYMENT REDIRECT ────────────────────────────────────
export function checkPaymentRedirect() {

  const params =
    new URLSearchParams(window.location.search);

  const payment =
    params.get('payment');

  const billId =
    params.get('billId');

  const meterSN =
    params.get('meterSN');

  if (!payment) return null;

  window.history.replaceState(
    {},
    document.title,
    window.location.pathname
  );

  return {
    status: payment,
    billId,
    meterSN
  };
}
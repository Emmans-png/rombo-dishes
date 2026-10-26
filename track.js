(() => {
  const url = window.ROMBO_SUPABASE_URL || '';
  const key = window.ROMBO_SUPABASE_ANON_KEY || '';
  const form = document.getElementById('tracking-form');
  const message = document.getElementById('tracking-message');
  const result = document.getElementById('tracking-result');
  const stages = [
    ['received', 'Received'],
    ['confirmed', 'Confirmed'],
    ['preparing', 'Preparing'],
    ['ready', 'Ready'],
    ['out_for_delivery', 'On the way'],
    ['completed', 'Completed'],
  ];
  const labels = Object.fromEntries(stages);
  labels.cancelled = 'Cancelled';
  const money = value => new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES' }).format(Number(value || 0));

  function renderOrder(order) {
    document.getElementById('result-reference').textContent = order.order_number;
    const status = document.getElementById('result-status');
    status.textContent = labels[order.order_status] || order.order_status;
    status.classList.toggle('cancelled', order.order_status === 'cancelled');

    const timeline = document.getElementById('result-timeline');
    timeline.replaceChildren();
    const currentIndex = stages.findIndex(([key]) => key === order.order_status);
    for (const [index, [, label]] of stages.entries()) {
      const step = document.createElement('div');
      step.className = `step${order.order_status !== 'cancelled' && index <= currentIndex ? ' done' : ''}`;
      const dot = document.createElement('span');
      dot.className = 'dot';
      const text = document.createElement('span');
      text.textContent = label;
      step.append(dot, text);
      timeline.append(step);
    }
    timeline.hidden = order.order_status === 'cancelled';

    const note = document.getElementById('tracking-note');
    note.textContent = order.tracking_update || '';
    note.hidden = !order.tracking_update;

    const items = document.getElementById('result-items');
    items.replaceChildren();
    for (const item of order.items || []) {
      const row = document.createElement('li');
      row.textContent = `${item.item_name} × ${item.quantity}`;
      items.append(row);
    }
    document.getElementById('result-total').textContent = `Total: ${money(order.total_kes)}`;
    document.getElementById('result-fulfilment').textContent = order.fulfilment === 'delivery' ? 'Delivery' : 'Pickup';
    document.getElementById('result-date').textContent = `Placed ${new Date(order.created_at).toLocaleString()}`;
    result.hidden = false;
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    result.hidden = true;
    message.textContent = '';
    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    submit.textContent = 'Checking…';
    try {
      if (!window.supabase || !url.startsWith('https://') || !key) throw new Error('Order tracking is not configured. Please contact Rombo Dishes.');
      const values = new FormData(form);
      const db = window.supabase.createClient(url, key);
      const { data, error } = await db.functions.invoke('track-order', {
        body: {
          order_number: String(values.get('order_number') || '').trim(),
          phone: String(values.get('phone') || '').trim(),
        },
      });
      if (error) {
        let detail;
        try { detail = await error.context?.json(); } catch { /* Use the generic message below. */ }
        throw new Error(detail?.error || 'Order not found. Check the reference and phone number, then try again.');
      }
      if (!data?.order) throw new Error('Order not found. Check the reference and phone number, then try again.');
      renderOrder(data.order);
    } catch (error) {
      message.textContent = error.message || 'Could not look up this order. Please try again.';
    } finally {
      submit.disabled = false;
      submit.textContent = 'Find order';
    }
  });

  const orderFromLink = new URLSearchParams(window.location.search).get('order');
  if (orderFromLink) form.elements.order_number.value = orderFromLink;
})();

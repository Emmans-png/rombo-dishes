(() => {
  const url = window.ROMBO_SUPABASE_URL || '';
  const key = window.ROMBO_SUPABASE_ANON_KEY || '';
  const orderSearchForm = document.getElementById('order-search-form');
  const form = document.getElementById('tracking-form');
  const message = document.getElementById('tracking-message');
  const result = document.getElementById('tracking-result');
  const enquiryForm = document.getElementById('enquiry-lookup-form');
  const enquiryMessage = document.getElementById('enquiry-message');
  const enquiryResult = document.getElementById('enquiry-result');
  const savedOrders = document.getElementById('saved-order-history');
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
  const linkedOrderNumber = new URLSearchParams(window.location.search).get('order');

  orderSearchForm.addEventListener('submit', async event => {
    event.preventDefault();
    result.hidden = true;
    message.textContent = '';
    form.hidden = true;
    const submit = orderSearchForm.querySelector('button[type="submit"]');
    submit.disabled = true;
    submit.textContent = 'Searching…';
    try {
      if (!window.supabase || !url.startsWith('https://') || !key) throw new Error('Order tracking is not configured. Please contact Rombo Dishes.');
      const phone = String(new FormData(orderSearchForm).get('phone') || '').trim();
      const db = window.supabase.createClient(url, key);
      const { data, error } = await db.functions.invoke('find-orders', { body: { phone } });
      if (error) {
        let detail;
        try { detail = await error.context?.json(); } catch { /* Use the generic message below. */ }
        throw new Error(detail?.error || 'Could not search orders. Check the phone number and try again.');
      }
      const orders = data?.orders || [];
      savedOrders.replaceChildren(new Option('Choose an order', ''));
      for (const order of orders) {
        const date = new Date(order.created_at).toLocaleDateString();
        savedOrders.add(new Option(`${order.order_number} · ${date}`, order.order_number));
      }
      if (!orders.length) {
        message.textContent = 'No orders were found for that phone number.';
        return;
      }
      form.elements.phone.value = phone;
      form.hidden = false;
      if (linkedOrderNumber && orders.some(order => order.order_number === linkedOrderNumber)) {
        savedOrders.value = linkedOrderNumber;
      }
      message.textContent = `Found ${orders.length} order${orders.length === 1 ? '' : 's'}. Choose one to see its status.`;
    } catch (error) {
      message.textContent = error.message || 'Could not search orders. Please try again.';
    } finally {
      submit.disabled = false;
      submit.textContent = 'Find my orders';
    }
  });

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

  enquiryForm.addEventListener('submit', async event => {
    event.preventDefault();
    enquiryMessage.textContent = '';
    enquiryResult.hidden = true;
    const submit = enquiryForm.querySelector('button[type="submit"]');
    submit.disabled = true;
    submit.textContent = 'Checking…';
    try {
      if (!window.supabase || !url.startsWith('https://') || !key) throw new Error('Price enquiry replies are not configured yet.');
      const values = new FormData(enquiryForm);
      const db = window.supabase.createClient(url, key);
      const { data, error } = await db.rpc('get_my_price_enquiries', {
        p_enquiry_id: String(values.get('enquiry_id') || '').trim(),
        p_phone: String(values.get('phone') || '').trim(),
      });
      if (error) throw error;
      if (!data || !data.length) {
        enquiryMessage.textContent = 'No enquiry was found for that reference and phone number.';
        return;
      }

      const item = data[0];
      document.getElementById('enquiry-item').textContent = item.item_name;
      document.getElementById('enquiry-status').textContent = item.status === 'replied' ? 'Replied' : item.status || 'New';
      const body = document.getElementById('enquiry-body');
      body.replaceChildren();
      const submitted = document.createElement('p');
      submitted.textContent = `Submitted: ${new Date(item.created_at).toLocaleString()}`;
      const customerMessage = document.createElement('p');
      customerMessage.textContent = `Your message: ${item.customer_message || 'No extra note provided.'}`;
      const reply = document.createElement('p');
      reply.textContent = `Rombo reply: ${item.admin_reply || 'No reply yet. Please check again later or call Rombo Dishes.'}`;
      body.append(submitted, customerMessage, reply);
      enquiryResult.hidden = false;
    } catch (error) {
      enquiryMessage.textContent = error.message || 'Could not find your enquiry reply yet.';
    } finally {
      submit.disabled = false;
      submit.textContent = 'Check reply';
    }
  });

  const enquiryFromLink = new URLSearchParams(window.location.search).get('enquiry');
  if (enquiryFromLink) enquiryForm.elements.enquiry_id.value = enquiryFromLink;
})();

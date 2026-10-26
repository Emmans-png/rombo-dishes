(() => {
  const url = window.ROMBO_SUPABASE_URL || '';
  const key = window.ROMBO_SUPABASE_ANON_KEY || '';
  const form = document.getElementById('tracking-form');
  const message = document.getElementById('tracking-message');
  const result = document.getElementById('tracking-result');
  const enquiryForm = document.getElementById('enquiry-lookup-form');
  const enquiryMessage = document.getElementById('enquiry-message');
  const enquiryResult = document.getElementById('enquiry-result');
  const savedOrders = document.getElementById('saved-order-history');
  const orderReferenceInput = form.elements.order_number;
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

  function loadOrderHistory() {
    try {
      const history = JSON.parse(localStorage.getItem('rombo-order-history') || '[]');
      savedOrders.querySelectorAll('option:not(:first-child):not(:last-child)').forEach(option => option.remove());
      for (const item of history) {
        if (!item?.orderNumber) continue;
        const option = document.createElement('option');
        option.value = item.orderNumber;
        const savedDate = item.savedAt ? new Date(item.savedAt).toLocaleDateString() : '';
        option.textContent = savedDate ? `${item.orderNumber} · ${savedDate}` : item.orderNumber;
        savedOrders.insertBefore(option, savedOrders.lastElementChild);
      }
      savedOrders.hidden = history.length === 0;
      savedOrders.required = history.length > 0;
      orderReferenceInput.hidden = history.length > 0;
      orderReferenceInput.required = history.length === 0;
    } catch (error) {
      savedOrders.hidden = true;
      savedOrders.required = false;
      orderReferenceInput.hidden = false;
      orderReferenceInput.required = true;
    }
  }

  savedOrders.addEventListener('change', () => {
    const enteringManualReference = savedOrders.value === '__manual__';
    orderReferenceInput.hidden = !enteringManualReference;
    orderReferenceInput.required = enteringManualReference;
    if (enteringManualReference) {
      orderReferenceInput.value = '';
      orderReferenceInput.focus();
    } else if (savedOrders.value) {
      orderReferenceInput.value = savedOrders.value;
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

  const orderFromLink = new URLSearchParams(window.location.search).get('order');
  loadOrderHistory();
  if (orderFromLink) {
    const matchingOption = [...savedOrders.options].find(option => option.value === orderFromLink);
    if (matchingOption) {
      savedOrders.value = orderFromLink;
      orderReferenceInput.value = orderFromLink;
      orderReferenceInput.hidden = true;
      orderReferenceInput.required = false;
    } else {
      savedOrders.value = '__manual__';
      orderReferenceInput.value = orderFromLink;
      orderReferenceInput.hidden = false;
      orderReferenceInput.required = true;
    }
  }
  const enquiryFromLink = new URLSearchParams(window.location.search).get('enquiry');
  if (enquiryFromLink) enquiryForm.elements.enquiry_id.value = enquiryFromLink;
})();

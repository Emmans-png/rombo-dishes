(() => {
  const url = window.ROMBO_SUPABASE_URL || '';
  const key = window.ROMBO_SUPABASE_ANON_KEY || '';
  const status = document.getElementById('backend-status');
  const menuEl = document.getElementById('order-menu');
  const cartEl = document.getElementById('cart-lines');
  const totalEl = document.getElementById('cart-total');
  const message = document.getElementById('checkout-message');
  const form = document.getElementById('checkout-form');
  const cart = new Map();
  let client = null;
  const ready = window.supabase && url.startsWith('https://') && !url.includes('YOUR_PROJECT_ID') && key && !key.includes('YOUR_SUPABASE');
  const money = n => new Intl.NumberFormat('en-KE', {maximumFractionDigits: 2}).format(Number(n || 0));
  const safe = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function setStatus(text, error=false) { status.hidden=!error; if(error){status.textContent=text;status.style.background='#f8d7da';status.style.color='#842029';} }
  function drawCart() {
    const items=[...cart.values()];
    if (!items.length) cartEl.textContent='Your cart is empty.';
    else cartEl.innerHTML=items.map(i=>`<div style="display:flex;justify-content:space-between;gap:12px;align-items:center;border-bottom:1px solid #eee3d3;padding:10px 0"><span><strong>${safe(i.name)}</strong><br><small>KSh ${money(i.price)} each</small></span><span><button type="button" data-dec="${safe(i.id)}" aria-label="Remove one ${safe(i.name)}">−</button> ${i.qty} <button type="button" data-inc="${safe(i.id)}" aria-label="Add one ${safe(i.name)}">+</button> <strong>KSh ${money(i.price*i.qty)}</strong></span></div>`).join('');
    totalEl.textContent=money(items.reduce((sum,i)=>sum+i.price*i.qty,0));
  }
  cartEl.addEventListener('click',e=>{
    const inc=e.target.closest('[data-inc]')?.dataset.inc;
    const dec=e.target.closest('[data-dec]')?.dataset.dec;
    if(inc && cart.has(inc)) cart.get(inc).qty++;
    if(dec && cart.has(dec)){cart.get(dec).qty--;if(cart.get(dec).qty<=0)cart.delete(dec);}
    drawCart();
  });
  function renderMenu(items) {
    if (!items.length) { menuEl.innerHTML='<p>No items are published yet. A Rombo admin can add menu items in <a href="admin.html"><strong>the admin dashboard</strong></a>.</p>'; return; }
    menuEl.innerHTML=items.map(i=>`<article class="food"><img src="${safe(i.image_url || 'https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=900&q=80')}" alt="${safe(i.name)}" loading="lazy"><div class="food-body"><h3>${safe(i.name)}</h3><p>${safe(i.description || '')}</p><div class="food-bottom"><strong>KSh ${money(i.price_kes)}</strong><button type="button" class="btn" style="padding:10px 14px" data-add="${safe(i.id)}">Add</button></div></div></article>`).join('');
    menuEl.querySelectorAll('[data-add]').forEach(btn=>btn.addEventListener('click',()=>{
      const item=items.find(i=>i.id===btn.dataset.add); if(!item)return;
      const existing=cart.get(item.id); if(existing) existing.qty++; else cart.set(item.id,{id:item.id,name:item.name,price:Number(item.price_kes),qty:1});
      drawCart(); message.textContent=`Added ${item.name} to your order.`;
    }));
  }
  if (!ready) {
    setStatus('Setup required: create a Supabase project, run supabase/schema.sql, then fill in supabase-config.js.', true);
    menuEl.innerHTML='<p>Once Supabase is configured and menu items are added in the admin dashboard, customers can add them here.</p>';
  } else {
    client=window.supabase.createClient(url,key);
    client.from('menu_items').select('id,name,description,price_kes,image_url,is_available').eq('is_available',true).order('name').then(({data,error})=>{
      if(error){setStatus('Could not load the menu. Check your Supabase URL, key, schema and policies.',true);console.error(error);return;}
      renderMenu(data||[]);
    });
  }
  document.getElementById('fulfilment').addEventListener('change',e=>{document.getElementById('delivery-address').required=e.target.value==='delivery';});
  form.addEventListener('submit',async e=>{
    e.preventDefault(); message.textContent='';
    if(!ready||!client){message.textContent='Backend is not configured yet. Follow SETUP-WINDOWS.md first.';return;}
    const items=[...cart.values()]; if(!items.length){message.textContent='Please add at least one menu item.';return;}
    const fd=new FormData(form); const payload={customer_name:fd.get('customer_name').trim(),phone:fd.get('phone').trim(),fulfilment:fd.get('fulfilment'),delivery_address:fd.get('delivery_address').trim(),payment_method:fd.get('payment_method'),notes:fd.get('notes').trim(),items:items.map(i=>({menu_item_id:i.id,quantity:i.qty}))};
    if(payload.fulfilment==='delivery'&&!payload.delivery_address){message.textContent='Please enter a delivery address.';return;}
    const submit=form.querySelector('button[type="submit"]'); submit.disabled=true; submit.textContent='Sending order…';
    try {
      const {data,error}=await client.functions.invoke('place-order',{body:payload});
      if(error) throw error;
      if(!data?.order_number) throw new Error(data?.error || 'The server did not confirm the order.');
      message.textContent=`Order received! Your reference is ${data.order_number}. Payment: ${data.payment_message || 'Pay on pickup/delivery.'} Please call Rombo to confirm fulfilment.`;
      const trackingLink=document.createElement('a');trackingLink.href=`track.html?order=${encodeURIComponent(data.order_number)}`;trackingLink.textContent='Track this order';message.append(document.createElement('br'),trackingLink);
      cart.clear(); drawCart(); form.reset(); document.getElementById('delivery-address').required=false;
    } catch(err) { console.error(err); message.textContent='Order was not confirmed. Please check the setup and try again, or call Rombo Dishes. Details: '+(err.message||'request failed'); }
    finally {submit.disabled=false;submit.textContent='Place order';}
  });
  drawCart();
})();

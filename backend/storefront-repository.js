const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const validId=value=>typeof value==='string'&&UUID.test(value);
const transaction=async(pool,fn)=>{const c=await pool.connect();try{await c.query('BEGIN');const value=await fn(c);await c.query('COMMIT');return value;}catch(error){await c.query('ROLLBACK').catch(()=>{});throw error;}finally{c.release();}};

// Only returns supplier-backed offers with current stock/price, resale rights,
// shipping permission to Georgia, and an explicitly verified image license.
export async function listStoreProducts(pool,{search='',category='',limit=60}={}){
  if(typeof search!=='string'||search.length>120||typeof category!=='string'||category.length>100||!Number.isInteger(limit)||limit<1||limit>100)throw new TypeError('Invalid catalog filters');
  const term=search.trim();
  const {rows}=await pool.query(`SELECT DISTINCT ON (p.id) p.id,p.title_ka,p.description_ka,p.price_gel_minor,
      p.original_price_gel_minor,p.image_url,c.name_ka AS category,c.slug AS category_slug,
      inv.quantity AS available_quantity,sp.supplier_sku,sp.currency_code,
      (sp.direct_shipping_enabled AND 'GE'=ANY(sp.direct_ship_countries) AND 'GE'=ANY(s.direct_ship_countries)) AS direct_eligible,
      (sp.eu_delivery_enabled AND cardinality(sp.eu_delivery_countries)>0 AND 'GE'=ANY(sp.onward_export_countries) AND 'GE'=ANY(s.onward_export_countries)) AS forwarding_eligible
    FROM products p
    JOIN eurofy_supplier_products sp ON sp.product_id=p.id
    JOIN eurofy_suppliers s ON s.id=sp.supplier_id
    JOIN LATERAL (SELECT availability,quantity,stale_after FROM eurofy_inventory_snapshots i WHERE i.supplier_product_id=sp.id ORDER BY checked_at DESC LIMIT 1) inv ON true
    JOIN LATERAL (SELECT price_minor,currency_code,observed_at FROM eurofy_supplier_price_history h WHERE h.supplier_product_id=sp.id ORDER BY observed_at DESC LIMIT 1) ph ON true
    LEFT JOIN categories c ON c.id=p.category_id
    WHERE p.is_active=true AND p.publication_status='published'
      AND s.enabled=true AND s.resale_authorized=true AND s.resale_evidence_ref IS NOT NULL AND s.terms_verified_at IS NOT NULL
      AND sp.authorized_for_resale=true AND sp.authorization_evidence_ref IS NOT NULL AND sp.terms_verified_at IS NOT NULL
      AND inv.availability='in_stock' AND inv.quantity>0 AND inv.stale_after>now()
      AND ph.price_minor=sp.supplier_price_minor AND ph.currency_code=sp.currency_code AND ph.observed_at>now()-interval '24 hours'
      AND EXISTS(SELECT 1 FROM eurofy_product_image_licenses l WHERE l.product_id=p.id AND l.image_url=p.image_url AND l.license_status='verified' AND l.evidence_reference IS NOT NULL AND l.verified_at IS NOT NULL AND 'GE'=ANY(l.allowed_countries))
      AND (sp.direct_shipping_enabled AND 'GE'=ANY(sp.direct_ship_countries) AND 'GE'=ANY(s.direct_ship_countries)
        OR sp.eu_delivery_enabled AND cardinality(sp.eu_delivery_countries)>0 AND 'GE'=ANY(sp.onward_export_countries) AND 'GE'=ANY(s.onward_export_countries))
      AND ($1='' OR p.title_ka ILIKE '%'||$1||'%' OR p.description_ka ILIKE '%'||$1||'%' OR c.name_ka ILIKE '%'||$1||'%' OR c.slug ILIKE '%'||$1||'%')
      AND ($2='' OR c.slug=$2 OR c.name_ka=$2)
    ORDER BY p.id,sp.updated_at DESC LIMIT $3`,[term,category,limit]);
  return rows;
}

export async function getPersistentCart(pool,userId){
  const {rows}=await pool.query(`SELECT ci.product_id,ci.quantity,p.title_ka,p.price_gel_minor,p.image_url,
      (p.is_active AND p.publication_status='published' AND inv.availability='in_stock' AND inv.quantity>=ci.quantity AND inv.stale_after>now()) AS available
    FROM eurofy_shopping_carts cart JOIN eurofy_shopping_cart_items ci ON ci.cart_id=cart.id
    JOIN products p ON p.id=ci.product_id
    LEFT JOIN LATERAL (SELECT availability,quantity,stale_after FROM eurofy_inventory_snapshots i JOIN eurofy_supplier_products sp ON sp.id=i.supplier_product_id WHERE sp.product_id=p.id ORDER BY checked_at DESC LIMIT 1) inv ON true
    WHERE cart.user_id=$1 ORDER BY ci.created_at`,[userId]);
  return rows;
}

export async function setPersistentCartItem(pool,{userId,productId,quantity}){
  if(!validId(userId)||!validId(productId)||!Number.isInteger(quantity)||quantity<0||quantity>20)throw new TypeError('Invalid cart item');
  return transaction(pool,async c=>{
    const cart=(await c.query('INSERT INTO eurofy_shopping_carts(user_id) VALUES($1) ON CONFLICT(user_id) DO UPDATE SET updated_at=now() RETURNING id',[userId])).rows[0];
    if(quantity===0){await c.query('DELETE FROM eurofy_shopping_cart_items WHERE cart_id=$1 AND product_id=$2',[cart.id,productId]);return {removed:true};}
    const product=(await c.query(`SELECT p.id FROM products p
      WHERE p.id=$1 AND p.is_active=true AND p.publication_status='published'
      AND EXISTS(SELECT 1 FROM eurofy_supplier_products sp JOIN eurofy_suppliers s ON s.id=sp.supplier_id
        JOIN LATERAL(SELECT availability,quantity,stale_after FROM eurofy_inventory_snapshots i WHERE i.supplier_product_id=sp.id ORDER BY checked_at DESC LIMIT 1) inv ON true
        JOIN LATERAL(SELECT price_minor,currency_code,observed_at FROM eurofy_supplier_price_history h WHERE h.supplier_product_id=sp.id ORDER BY observed_at DESC LIMIT 1) ph ON true
        WHERE sp.product_id=p.id AND s.enabled AND s.resale_authorized AND s.resale_evidence_ref IS NOT NULL AND s.terms_verified_at IS NOT NULL
          AND sp.authorized_for_resale AND sp.authorization_evidence_ref IS NOT NULL AND sp.terms_verified_at IS NOT NULL
          AND inv.availability='in_stock' AND inv.stale_after>now() AND ph.price_minor=sp.supplier_price_minor AND ph.currency_code=sp.currency_code AND ph.observed_at>now()-interval '24 hours'
          AND (sp.direct_shipping_enabled AND 'GE'=ANY(sp.direct_ship_countries) AND 'GE'=ANY(s.direct_ship_countries) OR sp.eu_delivery_enabled AND 'GE'=ANY(sp.onward_export_countries) AND 'GE'=ANY(s.onward_export_countries)))
      AND EXISTS(SELECT 1 FROM eurofy_product_image_licenses l WHERE l.product_id=p.id AND l.image_url=p.image_url AND l.license_status='verified' AND l.evidence_reference IS NOT NULL AND l.verified_at IS NOT NULL AND 'GE'=ANY(l.allowed_countries)) FOR UPDATE`,[productId])).rows[0];
    if(!product)throw Object.assign(new Error('Product is unavailable for purchase'),{code:'PRODUCT_UNAVAILABLE'});
    const offer=(await c.query(`SELECT sp.id,inv.quantity-COALESCE((SELECT sum(r.quantity) FROM eurofy_inventory_reservations r WHERE r.supplier_product_id=sp.id AND r.status='reserved'),0)::int AS remaining
      FROM eurofy_supplier_products sp JOIN eurofy_suppliers s ON s.id=sp.supplier_id
      JOIN LATERAL(SELECT quantity,availability,stale_after FROM eurofy_inventory_snapshots i WHERE i.supplier_product_id=sp.id ORDER BY checked_at DESC LIMIT 1) inv ON true
      WHERE sp.product_id=$1 AND s.enabled AND s.resale_authorized AND sp.authorized_for_resale
        AND inv.availability='in_stock' AND inv.stale_after>now()
        AND (sp.direct_shipping_enabled AND 'GE'=ANY(sp.direct_ship_countries) AND 'GE'=ANY(s.direct_ship_countries)
          OR sp.eu_delivery_enabled AND 'GE'=ANY(sp.onward_export_countries) AND 'GE'=ANY(s.onward_export_countries))
      ORDER BY remaining DESC LIMIT 1 FOR UPDATE OF sp`,[productId])).rows[0];
    const desired=quantity;
    if(!Number.isInteger(desired)||desired<1||desired>20||desired>offer.remaining)throw Object.assign(new Error('Requested quantity exceeds current stock'),{code:'STOCK_UNAVAILABLE'});
    const result=await c.query(`INSERT INTO eurofy_shopping_cart_items(cart_id,product_id,quantity) VALUES($1,$2,$3)
      ON CONFLICT(cart_id,product_id) DO UPDATE SET quantity=EXCLUDED.quantity,updated_at=now() RETURNING product_id,quantity`,[cart.id,productId,desired]);
    return result.rows[0];
  });
}

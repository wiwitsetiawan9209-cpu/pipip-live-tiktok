import { z } from 'zod';
import type { DatabaseSync } from 'node:sqlite';

export const ProductSchema = z.object({
  id: z.string().trim().min(1).max(120), name: z.string().trim().min(1).max(200),
  category: z.string().trim().max(120).default(''), price: z.number().finite().nonnegative().nullable().default(null),
  currency: z.string().regex(/^[A-Z]{3}$/).nullable().default(null), promoPrice: z.number().finite().nonnegative().nullable().default(null),
  description: z.string().max(2000).default(''), benefits: z.array(z.string().max(500)).max(30).default([]),
  specifications: z.array(z.string().max(500)).max(50).default([]), variants: z.array(z.string().max(200)).max(50).default([]),
  stock: z.number().int().nonnegative().nullable().default(null), images: z.array(z.string().max(2000)).max(20).default([]),
  status: z.enum(['ACTIVE','INACTIVE','ARCHIVED']).default('ACTIVE'), sellingPoints: z.array(z.string().max(500)).max(30).default([]),
  targetAudience: z.array(z.string().max(300)).max(30).default([]), preferredTalkingPoints: z.array(z.string().max(500)).max(30).default([]),
  forbiddenClaims: z.array(z.string().trim().min(1).max(300)).max(50).default([]), priority: z.number().int().min(0).max(100).default(50),
  updatedAt: z.string().datetime().optional()
}).strict().superRefine((p, ctx) => { if (p.promoPrice !== null && p.price !== null && p.promoPrice > p.price) ctx.addIssue({code:z.ZodIssueCode.custom,path:['promoPrice'],message:'Promo price cannot exceed regular price'}); });
export type Product = z.infer<typeof ProductSchema>;
export type ProductInput = Omit<Product, 'updatedAt'> & { updatedAt?: string };
export interface ProductRepository { list(): Product[]; get(id: string): Product | null; save(product: Product): Product; }

export class SQLiteProductRepository implements ProductRepository {
  constructor(private readonly db: DatabaseSync, private readonly now: () => string = () => new Date().toISOString()) {}
  list(): Product[] { return (this.db.prepare('SELECT * FROM products ORDER BY name COLLATE NOCASE').all() as Record<string, unknown>[]).map(row => this.fromRow(row)); }
  get(id: string): Product | null { const row = this.db.prepare('SELECT * FROM products WHERE id=?').get(id) as Record<string, unknown> | undefined; return row ? this.fromRow(row) : null; }
  save(product: Product): Product {
    const checked = ProductSchema.parse(product); const updatedAt = this.now(); const normalized = { ...checked, updatedAt };
    const metadata = { ...normalized }; delete (metadata as Partial<Product>).id; delete (metadata as Partial<Product>).name; delete (metadata as Partial<Product>).description; delete (metadata as Partial<Product>).price; delete (metadata as Partial<Product>).currency; delete (metadata as Partial<Product>).stock; delete (metadata as Partial<Product>).updatedAt;
    this.db.prepare(`INSERT INTO products(id,name,description,price,currency,stock,metadata_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,description=excluded.description,price=excluded.price,currency=excluded.currency,stock=excluded.stock,metadata_json=excluded.metadata_json,updated_at=excluded.updated_at`).run(normalized.id, normalized.name, normalized.description, normalized.price, normalized.currency, normalized.stock, JSON.stringify(metadata), updatedAt, updatedAt);
    return normalized;
  }
  private fromRow(row: Record<string, unknown>): Product {
    let metadata: Record<string, unknown> = {}; try { metadata = JSON.parse(String(row.metadata_json ?? '{}')) as Record<string, unknown>; } catch { /* legacy malformed metadata falls back to base columns */ }
    const merged = { ...metadata, id: row.id, name: row.name, description: row.description, price: row.price ?? null, currency: row.currency ?? null, stock: row.stock ?? null, updatedAt: row.updated_at };
    // Older rows predate the full Product schema; hydrate optional fields with safe defaults.
    return ProductSchema.parse(merged);
  }
}

export class ProductCatalog {
  constructor(private readonly repository: ProductRepository) {}
  list(): Product[] { return this.repository.list(); }
  get(id: string): Product | null { return this.repository.get(id); }
  search(query: string): Product[] { const q=query.trim().toLocaleLowerCase(); return this.list().filter(p=>!q||[p.name,p.category,p.description,...p.benefits,...p.sellingPoints].join(' ').toLocaleLowerCase().includes(q)); }
  active(): Product[] { return this.list().filter(p=>p.status==='ACTIVE'&&(p.stock===null||p.stock>0)); }
  save(input: unknown): Product { return this.repository.save(ProductSchema.parse(input)); }
}

export interface ProductSelectionContext { conversation: string; audienceIntent?: string; currentProductId?: string; now?: number; repeatedProductCooldownMs?:number; }
export interface ProductDecision { productId: string; strategy: 'PRODUCT_INTRO'; reason: string; score: number; }
export class ProductSelector {
  private readonly mentions = new Map<string, number[]>();
  constructor(private readonly catalog: ProductCatalog, private readonly cooldownMs = 180_000, private readonly now = () => Date.now()) {}
  reset():void { this.mentions.clear(); }
  select(context: ProductSelectionContext): ProductDecision | null {
    const now=context.now ?? this.now(); const text=`${context.conversation} ${context.audienceIntent ?? ''}`.toLocaleLowerCase();
    const candidates=this.catalog.active().map(p=>{
      const history=(this.mentions.get(p.id)??[]).filter(t=>now-t<30*60_000); this.mentions.set(p.id,history);
      const recent=history.length>0&&now-history.at(-1)!<(context.repeatedProductCooldownMs??this.cooldownMs);
      const terms=[p.name,p.category,...p.targetAudience,...p.preferredTalkingPoints,...p.sellingPoints].filter(Boolean);
      const relevance=terms.reduce((n,t)=>n+(text.includes(t.toLocaleLowerCase())?8:0),0);
      const promo=p.promoPrice!==null?8:0; const stock=p.stock===null?0:Math.min(10,p.stock>0?3:0);
      const priority=p.priority/10; const repeat=history.length?Math.min(12,history.length*3):0;
      const score=priority+promo+stock+relevance-repeat-(recent?100:0)-(context.currentProductId===p.id?20:0);
      return {p,score,recent};
    }).filter(x=>!x.recent).sort((a,b)=>b.score-a.score||a.p.id.localeCompare(b.p.id));
    const chosen=candidates[0]; if(!chosen)return null;
    const list=this.mentions.get(chosen.p.id)??[]; list.push(now); this.mentions.set(chosen.p.id,list);
    const reason=chosen.score>=10?'promotion_or_relevance':chosen.score>=5?'product_priority':'rotation';
    return {productId:chosen.p.id,strategy:'PRODUCT_INTRO',reason,score:chosen.score};
  }
  recordMention(productId:string, at=this.now()):void { if(!this.catalog.get(productId))throw new Error('Unknown product'); const xs=this.mentions.get(productId)??[];xs.push(at);this.mentions.set(productId,xs); }
}

export type SalesStage='HOOK'|'PROBLEM'|'BENEFIT'|'PRODUCT_INTRO'|'SPECIFICATION'|'PRICE'|'OBJECTION_HANDLING'|'COMPARISON'|'CROSS_SELL'|'UPSELL'|'CTA';
export interface SalesPlan { stage: SalesStage; talkingPoint: string | null; }
export class SalesStrategyEngine {
  private previousStage: SalesStage | null=null;
  plan(product: Product, input: { conversation?: string; requestedStage?: SalesStage } = {}): SalesPlan {
    const available: SalesStage[]=['HOOK','PROBLEM','BENEFIT','PRODUCT_INTRO','SPECIFICATION','PRICE','OBJECTION_HANDLING','COMPARISON','CROSS_SELL','UPSELL','CTA'];
    const stage=input.requestedStage&&available.includes(input.requestedStage)?input.requestedStage:this.choose(product,input.conversation??'');
    const points=stage==='BENEFIT'?product.benefits:stage==='SPECIFICATION'?product.specifications:stage==='HOOK'||stage==='PRODUCT_INTRO'?product.preferredTalkingPoints:stage==='PROBLEM'?product.targetAudience:product.sellingPoints;
    this.previousStage=stage; return {stage,talkingPoint:points[0]??null};
  }
  private choose(p:Product, text:string):SalesStage { const t=text.toLocaleLowerCase(); if(/price|harga|berapa|cost/.test(t))return 'PRICE';if(/compare|banding/.test(t))return 'COMPARISON';if(/expensive|mahal|objection|ragu/.test(t))return 'OBJECTION_HANDLING'; if(this.previousStage==='CTA')return 'BENEFIT';if(p.promoPrice!==null)return 'HOOK';if(p.specifications.length)return 'SPECIFICATION';if(p.benefits.length)return 'BENEFIT';return 'PRODUCT_INTRO'; }
}

export class ProductContextBuilder {
  build(product: Product) {
    const p=ProductSchema.parse(product); if(p.status!=='ACTIVE'||p.stock===0)throw new Error('Product is unavailable');
    return { id:p.id,name:p.name,price:p.price??undefined,currency:p.currency??undefined,description:p.description,category:p.category||undefined,promoPrice:p.promoPrice??undefined,benefits:p.benefits,specifications:p.specifications,variants:p.variants,stock:p.stock??undefined,sellingPoints:p.sellingPoints,targetAudience:p.targetAudience,preferredTalkingPoints:p.preferredTalkingPoints,forbiddenClaims:p.forbiddenClaims };
  }
}

export class ProductClaimPolicy {
  validate(speech:string, product: {id:string;name:string;price?:number|undefined;promoPrice?:number|undefined;stock?:number|undefined;benefits:string[];forbiddenClaims:string[]}): {ok:true}|{ok:false;reason:string} {
    const lower=speech.toLocaleLowerCase();
    if(product.forbiddenClaims.some(claim=>claim&&lower.includes(claim.toLocaleLowerCase())))return {ok:false,reason:'forbidden_claim'};
    if(/\d\s*%|\b(?:diskon|discount|terjual|sold|review|reviews|bintang|stars|rating)\b/i.test(speech))return {ok:false,reason:'unsupported_promotion_or_social_proof'};
    const knownNumbers=[product.price,product.promoPrice,product.stock].filter((x):x is number=>typeof x==='number').map(String);
    const matches=speech.match(/(?:\d[\d.,]*|\b(?:gratis|free)\b)/gi)??[];
    for(const token of matches){const numeric=token.toLocaleLowerCase().replace(/[.,]/g,'');if(/^\d/.test(token)&&!knownNumbers.some(n=>n===token||n.replace(/[.,]/g,'')===numeric))return {ok:false,reason:'unsupported_numeric_claim'};if(!/^\d/.test(token)&&!product.benefits.some(x=>x.toLocaleLowerCase().includes(token)))return {ok:false,reason:'unsupported_offer_claim'};}
    if(/(?:garansi|dijamin|guaranteed|terbukti|nomor\s+satu|best seller|#\s*1|no\.\s*1)/i.test(speech))return {ok:false,reason:'unsupported_guarantee_or_review'};
    return {ok:true};
  }
}

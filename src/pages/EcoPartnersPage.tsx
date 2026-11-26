import React, { useState } from 'react';
import {
  Globe,
  ShieldCheck,
  Building2,
  HeartHandshake,
  CheckCircle2,
  ExternalLink,
  Send,
  Sparkles,
  TreePine,
  Coins,
  Package,
  Clock,
  Check,
  AlertCircle,
  Phone,
  Mail,
  User,
  MapPin,
  Search,
  Filter,
  ArrowRight,
  TrendingUp,
  Zap,
  X,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useEco } from '../context/EcoContext';
import { EcoPartner } from '../types/eco';
import heroEcoForestImg from '../assets/images/hero_eco_forest_1795179384249.jpg';

export const EcoPartnersPage: React.FC = () => {
  const {
    user,
    partners,
    sponsorshipProjects,
    sponsorshipProposals,
    submitSponsorshipProposal,
    triggerConfetti,
    triggerHaptic,
  } = useEco();

  const [activeTab, setActiveTab] = useState<'partners' | 'projects' | 'apply' | 'my_proposals'>('partners');
  const [partnerCategory, setPartnerCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPartnerDetail, setSelectedPartnerDetail] = useState<EcoPartner | null>(null);

  // Proposal form state
  const [companyName, setCompanyName] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [sponsorshipType, setSponsorshipType] = useState<'funds' | 'products' | 'events' | 'mixed'>('products');
  const [fundingAmountUZS, setFundingAmountUZS] = useState('');
  const [productDescription, setProductDescription] = useState('');
  const [targetSchoolsOrRegions, setTargetSchoolsOrRegions] = useState('Barcha hududlar');
  const [proposalDetails, setProposalDetails] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  const categories = [
    { id: 'all', label: 'Barcha' },
    { id: 'Davlat organi', label: 'Davlat' },
    { id: 'Ta\'lim', label: 'Ta\'lim' },
    { id: 'Yoshlar tashkiloti', label: 'Yoshlar' },
    { id: 'Xususiy sektor', label: 'Biznes' },
    { id: 'Yashil texnologiyalar', label: 'Eko-Tech' },
  ];

  const filteredPartners = partners.filter(p => {
    const matchesCategory = partnerCategory === 'all' || p.category === partnerCategory;
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                         p.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const handleSubmitProposal = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    triggerHaptic('medium');
    
    const success = await submitSponsorshipProposal({
      companyName,
      contactPerson: contactPerson || user.fullName,
      contactEmail: contactEmail || user.email,
      contactPhone,
      sponsorshipType,
      fundingAmountUZS: fundingAmountUZS ? Number(fundingAmountUZS) : undefined,
      productDescription,
      targetSchoolsOrRegions,
      proposalDetails,
    });

    setIsSubmitting(false);
    if (success) {
      setSubmitSuccess(true);
      triggerConfetti();
      triggerHaptic('success');
    }
  };

  return (
    <div className="min-h-screen bg-[#f2f7f4] dark:bg-[#040D0A] text-slate-900 dark:text-white pb-24">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 pt-4 sm:pt-6 space-y-5">
        {/* Compact Duolingo Dark-Emerald Hero */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#072419] via-[#051811] to-[#040D0A] border border-emerald-500/30 p-5 sm:p-6 text-white shadow-xl">
          <img
            src={heroEcoForestImg}
            className="absolute inset-0 w-full h-full object-cover opacity-20 mix-blend-luminosity pointer-events-none"
            alt="Eco Partners Hero"
          />
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-2 max-w-2xl">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/15 border border-emerald-400/30 text-[#00F5A0] text-[10px] font-black uppercase tracking-wider">
                <HeartHandshake className="w-3.5 h-3.5" /> Hamkorlik Tarmog'i
              </div>
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight leading-tight">
                Eco <span className="text-[#00F5A0]">Hamkorlar</span> va Homiylar
              </h1>
              <p className="text-xs sm:text-sm text-emerald-100/80 font-medium leading-relaxed">
                O'zbekiston yoshlarining ekologik tashabbuslarini qo'llab-quvvatlovchi davlat idoralari va korporativ homiylar ekotizimi.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 shrink-0">
              <div className="flex items-center gap-2 px-3.5 py-2.5 bg-[#040D0A]/70 backdrop-blur-md rounded-xl border border-emerald-500/25">
                <Building2 className="w-4 h-4 text-[#00F5A0]" />
                <span className="text-xs font-black tabular-nums">{partners.length} Tasdiqlangan Hamkor</span>
              </div>
              <button
                onClick={() => setActiveTab('apply')}
                className="px-5 py-2.5 bg-gradient-to-r from-[#00F5A0] to-[#10B981] hover:brightness-105 text-[#04110B] rounded-xl font-black text-xs uppercase tracking-wider border-b-[3px] border-emerald-700 active:translate-y-[1px] transition-all min-h-[44px] cursor-pointer"
              >
                Homiy Bo'lish
              </button>
            </div>
          </div>
        </div>

        {/* Compact Navigation & Search Bar */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 p-3 bg-white dark:bg-[#061812] rounded-2xl border border-slate-200 dark:border-emerald-500/20 shadow-sm">
          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-[#040D0A] rounded-xl border border-slate-200 dark:border-emerald-500/15 overflow-x-auto scrollbar-hide">
            {[
              { id: 'partners', label: 'Hamkorlar' },
              { id: 'projects', label: 'Loyihalar' },
              { id: 'apply', label: 'Ariza Berish' },
              { id: 'my_proposals', label: 'Mening Arizalarim' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-3.5 py-2 rounded-lg text-[11px] font-black uppercase tracking-wider transition-all whitespace-nowrap min-h-[38px] cursor-pointer ${
                  activeTab === tab.id
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="md:w-72 relative group">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-emerald-500 transition-colors" />
            <input
              type="text"
              placeholder="Hamkorlarni qidirish..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-3.5 py-2.5 bg-slate-50 dark:bg-[#040D0A] rounded-xl text-xs font-bold outline-none border border-slate-200 dark:border-emerald-500/20 focus:border-emerald-500 transition-all min-h-[42px]"
            />
          </div>
        </div>

        <AnimatePresence mode="wait">
          {activeTab === 'partners' && (
            <motion.div
              key="partners"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              className="space-y-4"
            >
              {/* Category Filter */}
              <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
                {categories.map(cat => (
                  <button
                    key={cat.id}
                    onClick={() => setPartnerCategory(cat.id)}
                    className={`px-3.5 py-2 rounded-xl text-[11px] font-black uppercase tracking-wider whitespace-nowrap transition-all border min-h-[38px] cursor-pointer ${
                      partnerCategory === cat.id
                        ? 'bg-emerald-600 border-emerald-600 text-white shadow-sm'
                        : 'bg-white dark:bg-[#061812] border-slate-200 dark:border-emerald-500/20 text-slate-600 dark:text-slate-300 hover:border-emerald-500/50'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredPartners.map((partner, idx) => (
                  <motion.div
                    key={partner.id}
                    initial={{ opacity: 0, scale: 0.97 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: idx * 0.04 }}
                    className="group bg-white dark:bg-[#061812] rounded-2xl border border-slate-200 dark:border-emerald-500/20 p-5 shadow-sm hover:border-emerald-500/40 transition-all flex flex-col justify-between h-full"
                  >
                    <div className="space-y-3.5">
                      <div className="flex justify-between items-start gap-2">
                        <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-[#00F5A0] font-black text-base shrink-0">
                          {partner.logoText}
                        </div>
                        <div className="px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-[#00F5A0] text-[10px] font-black uppercase tracking-wider">
                          {partner.category}
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <h3 className="text-base font-black text-slate-900 dark:text-white tracking-tight leading-snug">{partner.name}</h3>
                        <p className="text-xs text-slate-600 dark:text-slate-400 font-medium leading-relaxed line-clamp-3">
                          {partner.description}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 pt-3.5 border-t border-slate-100 dark:border-emerald-500/15 flex justify-between items-center gap-3">
                      <div>
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Grant Fondi</span>
                        <div className="text-sm font-black text-emerald-600 dark:text-[#00F5A0] tabular-nums">
                          {(partner.totalDonationUZS || 0).toLocaleString()} UZS
                        </div>
                      </div>
                      <button
                        onClick={() => setSelectedPartnerDetail(partner)}
                        className="min-h-[44px] min-w-[44px] flex items-center justify-center bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 rounded-xl hover:bg-emerald-600 hover:text-white hover:border-emerald-600 transition-all cursor-pointer"
                        aria-label="Hamkor tafsilotlari"
                      >
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}

          {activeTab === 'apply' && (
            <motion.div
              key="apply"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              className="max-w-3xl mx-auto"
            >
              <div className="p-5 sm:p-7 rounded-3xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 shadow-lg space-y-6">
                <div className="text-center space-y-2">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 dark:text-[#00F5A0] flex items-center justify-center mx-auto">
                    <HeartHandshake className="w-6 h-6" />
                  </div>
                  <h2 className="text-xl sm:text-2xl font-black tracking-tight">Homiylik Taklifi</h2>
                  <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 font-medium max-w-lg mx-auto">
                    ECO HERO platformasi orqali maktablardagi yashil loyihalarni moliyalashtiring va ijtimoiy mas'uliyatli hamkorga aylaning.
                  </p>
                </div>

                {submitSuccess ? (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-6 text-center bg-emerald-500/10 rounded-2xl border border-emerald-500/25 space-y-3">
                    <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
                    <h3 className="text-lg font-black">Arizangiz yuborildi!</h3>
                    <p className="text-xs text-slate-600 dark:text-slate-300 font-medium">Boshqaruv jamoasi taklifingizni ko'rib chiqib, 24 soat ichida aloqaga chiqadi.</p>
                    <button
                      onClick={() => setSubmitSuccess(false)}
                      className="px-5 py-2.5 bg-gradient-to-r from-[#00F5A0] to-[#10B981] text-[#04110B] rounded-xl font-black text-xs uppercase tracking-wider border-b-[3px] border-emerald-700 min-h-[44px] cursor-pointer"
                    >
                      Yangi Ariza Yuborish
                    </button>
                  </motion.div>
                ) : (
                  <form onSubmit={handleSubmitProposal} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-4">
                      <div className="space-y-1.5">
                        <label className="text-[11px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider">Tashkilot Nomi</label>
                        <input required type="text" value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="Kompaniya nomi..." className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-[#040D0A] rounded-xl text-xs font-bold outline-none border border-slate-200 dark:border-emerald-500/20 focus:border-emerald-500 min-h-[42px]" />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[11px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider">Homiylik Turi</label>
                        <select value={sponsorshipType} onChange={e => setSponsorshipType(e.target.value as any)} className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-[#040D0A] rounded-xl text-xs font-bold outline-none border border-slate-200 dark:border-emerald-500/20 focus:border-emerald-500 min-h-[42px]">
                          <option value="products">Mahsulotlar (Shop)</option>
                          <option value="funds">Pul mablag'lari</option>
                          <option value="events">Hasharlar homiyligi</option>
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[11px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider">Email</label>
                        <input required type="email" value={contactEmail} onChange={e => setContactEmail(e.target.value)} placeholder="Email manzili..." className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-[#040D0A] rounded-xl text-xs font-bold outline-none border border-slate-200 dark:border-emerald-500/20 focus:border-emerald-500 min-h-[42px]" />
                      </div>
                    </div>
                    <div className="space-y-4">
                      <div className="space-y-1.5">
                        <label className="text-[11px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider">Mas'ul Shaxs</label>
                        <input required type="text" value={contactPerson} onChange={e => setContactPerson(e.target.value)} placeholder="Ism va sharif..." className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-[#040D0A] rounded-xl text-xs font-bold outline-none border border-slate-200 dark:border-emerald-500/20 focus:border-emerald-500 min-h-[42px]" />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[11px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider">Mablag' miqdori (UZS)</label>
                        <input type="number" value={fundingAmountUZS} onChange={e => setFundingAmountUZS(e.target.value)} placeholder="Masalan: 50,000,000" className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-[#040D0A] rounded-xl text-xs font-bold outline-none border border-slate-200 dark:border-emerald-500/20 focus:border-emerald-500 min-h-[42px] tabular-nums" />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[11px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider">Telefon</label>
                        <input type="tel" value={contactPhone} onChange={e => setContactPhone(e.target.value)} placeholder="+998..." className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-[#040D0A] rounded-xl text-xs font-bold outline-none border border-slate-200 dark:border-emerald-500/20 focus:border-emerald-500 min-h-[42px]" />
                      </div>
                    </div>
                    <div className="md:col-span-2 space-y-1.5">
                      <label className="text-[11px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider">Loyiha Tafsilotlari</label>
                      <textarea rows={3} value={proposalDetails} onChange={e => setProposalDetails(e.target.value)} placeholder="Qanday yordam bermoqchisiz? (Velosipedlar, IT vaucherlar, Ko'chatlar...)" className="w-full p-3.5 bg-slate-50 dark:bg-[#040D0A] rounded-xl text-xs font-bold outline-none border border-slate-200 dark:border-emerald-500/20 focus:border-emerald-500 resize-none" />
                    </div>
                    <div className="md:col-span-2 pt-1">
                      <button
                        disabled={isSubmitting}
                        type="submit"
                        className="w-full py-3.5 bg-gradient-to-r from-[#00F5A0] to-[#10B981] hover:brightness-105 text-[#04110B] rounded-xl font-black text-xs uppercase tracking-wider border-b-[3px] border-emerald-700 active:translate-y-[1px] transition-all min-h-[46px] cursor-pointer"
                      >
                        {isSubmitting ? 'Yuborilmoqda...' : 'Homiylik Taklifini Tasdiqlash'}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </motion.div>
          )}

          {activeTab === 'projects' && (
            <motion.div
              key="projects"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="grid grid-cols-1 md:grid-cols-2 gap-4"
            >
              {sponsorshipProjects.map(project => (
                <div key={project.id} className="group bg-white dark:bg-[#061812] rounded-3xl border border-slate-200 dark:border-emerald-500/20 overflow-hidden shadow-md flex flex-col">
                  <div className="relative h-48 overflow-hidden">
                    <img src={project.imageUrl} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" alt={project.title} />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#040D0A]/90 via-[#040D0A]/30 to-transparent" />
                    <div className="absolute top-3.5 left-3.5 flex flex-wrap gap-1.5">
                      <div className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-[10px] font-black uppercase tracking-wider">{project.category}</div>
                      <div className="px-2.5 py-1 rounded-lg bg-black/50 backdrop-blur-md border border-white/15 text-white text-[10px] font-bold">{project.partnerName}</div>
                    </div>
                    <div className="absolute bottom-3.5 left-3.5 right-3.5 space-y-2">
                      <h3 className="text-base sm:text-lg font-black text-white tracking-tight leading-snug">{project.title}</h3>
                      <div className="space-y-1">
                        <div className="flex justify-between text-[10px] font-black text-emerald-200/80 uppercase tracking-wider tabular-nums">
                          <span>Yig'ilgan mablag'</span>
                          <span>{Math.round((project.raisedAmountUZS / project.targetAmountUZS) * 100)}%</span>
                        </div>
                        <div className="w-full h-1.5 bg-white/15 rounded-full overflow-hidden">
                          <motion.div initial={{ width: 0 }} animate={{ width: `${Math.min(100, (project.raisedAmountUZS / project.targetAmountUZS) * 100)}%` }} className="h-full bg-[#00F5A0]" />
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="p-4 sm:p-5 space-y-4 flex-1 flex flex-col">
                    <p className="text-xs text-slate-600 dark:text-slate-300 font-medium leading-relaxed flex-1">
                      {project.description}
                    </p>
                    <div className="grid grid-cols-2 gap-3 py-3 border-y border-slate-100 dark:border-emerald-500/15">
                      <div>
                        <div className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Maktablar</div>
                        <div className="text-sm font-black text-slate-900 dark:text-white tabular-nums">{project.schoolsBenefited}</div>
                      </div>
                      <div>
                        <div className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Natija</div>
                        <div className="text-sm font-black text-emerald-600 dark:text-[#00F5A0]">{project.treesPlantedOrImpact}</div>
                      </div>
                    </div>
                    <button
                      onClick={() => setActiveTab('apply')}
                      className="w-full py-2.5 bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 rounded-xl text-xs font-black uppercase tracking-wider hover:bg-emerald-600 hover:text-white hover:border-emerald-600 transition-all min-h-[44px] cursor-pointer"
                    >
                      Loyihani Qo'llab-quvvatlash
                    </button>
                  </div>
                </div>
              ))}
            </motion.div>
          )}

          {activeTab === 'my_proposals' && (
            <motion.div key="my_proposals" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-black tracking-tight">Arizalar Tarixi</h2>
                <div className="flex items-center gap-1.5 text-slate-400 text-xs font-bold tabular-nums">
                  <Clock className="w-4 h-4" /> {sponsorshipProposals.length} ta yozuv
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {sponsorshipProposals.map(prop => (
                  <div key={prop.id} className="bg-white dark:bg-[#061812] rounded-2xl border border-slate-200 dark:border-emerald-500/20 p-4 sm:p-5 shadow-sm space-y-3">
                    <div className="flex justify-between items-start gap-2">
                      <div>
                        <h4 className="text-sm font-black tracking-tight">{prop.companyName}</h4>
                        <div className="flex items-center gap-2 text-[11px] font-semibold text-slate-400">
                          <span>{prop.contactPerson}</span>
                          <span>•</span>
                          <span>{new Date(prop.submittedAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                      <div className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider ${
                        prop.status === 'approved' ? 'bg-emerald-500 text-white' :
                        prop.status === 'rejected' ? 'bg-rose-500 text-white' : 'bg-amber-500 text-white'
                      }`}>
                        {prop.status}
                      </div>
                    </div>
                    <div className="p-3 bg-slate-50 dark:bg-[#040D0A] rounded-xl text-xs font-medium text-slate-600 dark:text-slate-300 leading-relaxed border border-slate-100 dark:border-emerald-500/15">
                      "{prop.proposalDetails}"
                    </div>
                    {prop.adminNotes && (
                      <div className="p-3 bg-emerald-500/10 rounded-xl border border-emerald-500/20 space-y-1">
                        <div className="text-[10px] font-black text-emerald-600 dark:text-[#00F5A0] uppercase tracking-wider">Administrator Izohi</div>
                        <p className="text-xs font-semibold text-emerald-900 dark:text-emerald-100">{prop.adminNotes}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {sponsorshipProposals.length === 0 && (
                <div className="p-10 text-center bg-white dark:bg-[#061812] rounded-3xl border border-slate-200 dark:border-emerald-500/20 text-slate-400 space-y-3">
                  <Package className="w-12 h-12 mx-auto opacity-30" />
                  <p className="text-xs font-black uppercase tracking-wider">Hali hech qanday ariza yuborilmagan</p>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Partner Detail Modal */}
      <AnimatePresence>
        {selectedPartnerDetail && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSelectedPartnerDetail(null)} className="absolute inset-0 bg-black/80 backdrop-blur-md" />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="relative w-full max-w-xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/25 rounded-3xl p-5 sm:p-6 shadow-2xl space-y-5">
              <div className="flex justify-between items-start gap-3">
                <div className="flex items-center gap-3.5">
                  <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-[#00F5A0] border border-emerald-500/25 flex items-center justify-center font-black text-xl uppercase shrink-0">
                    {selectedPartnerDetail.logoText}
                  </div>
                  <div>
                    <h3 className="text-lg font-black tracking-tight">{selectedPartnerDetail.name}</h3>
                    <p className="text-[11px] font-black text-emerald-600 dark:text-[#00F5A0] uppercase tracking-wider">{selectedPartnerDetail.category}</p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedPartnerDetail(null)}
                  className="min-h-[40px] min-w-[40px] flex items-center justify-center bg-slate-100 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 rounded-xl text-slate-500 hover:text-slate-900 dark:hover:text-white transition-all cursor-pointer"
                  aria-label="Yopish"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <p className="text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-300 leading-relaxed">
                  {selectedPartnerDetail.description}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="p-3.5 bg-slate-50 dark:bg-[#040D0A] rounded-2xl border border-slate-200 dark:border-emerald-500/20 space-y-2.5">
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Bog'lanish</h4>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-xs font-bold"><Mail className="w-3.5 h-3.5 text-emerald-500 shrink-0" /> <span className="truncate">{selectedPartnerDetail.contactEmail}</span></div>
                      <div className="flex items-center gap-2 text-xs font-bold"><Phone className="w-3.5 h-3.5 text-emerald-500 shrink-0" /> {selectedPartnerDetail.contactPhone}</div>
                      <div className="flex items-center gap-2 text-xs font-bold"><User className="w-3.5 h-3.5 text-emerald-500 shrink-0" /> {selectedPartnerDetail.contactPerson}</div>
                    </div>
                  </div>
                  <div className="p-3.5 bg-slate-50 dark:bg-[#040D0A] rounded-2xl border border-slate-200 dark:border-emerald-500/20 space-y-2.5">
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Statistika</h4>
                    <div className="space-y-2">
                      <div className="flex justify-between items-center text-xs font-bold"><span>Tasdiqlangan Homiy</span> <CheckCircle2 className="w-4 h-4 text-emerald-500" /></div>
                      <div className="flex justify-between items-center text-xs font-bold"><span>Mahsulotlar</span> <span className="text-emerald-600 dark:text-[#00F5A0] tabular-nums">{selectedPartnerDetail.sponsoredProductsCount} ta</span></div>
                      <div className="flex justify-between items-center text-xs font-bold"><span>Ta'siri</span> <span className="text-emerald-600 dark:text-[#00F5A0] tabular-nums">{selectedPartnerDetail.projectsSupported}</span></div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <a
                  href={selectedPartnerDetail.website}
                  target="_blank"
                  rel="noreferrer"
                  className="flex-1 py-3 bg-gradient-to-r from-[#00F5A0] to-[#10B981] text-[#04110B] rounded-xl font-black text-xs uppercase tracking-wider text-center border-b-[3px] border-emerald-700 flex items-center justify-center gap-1.5 min-h-[44px]"
                >
                  <span>Veb-saytga O'tish</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
                <button
                  onClick={() => setSelectedPartnerDetail(null)}
                  className="px-5 py-3 bg-slate-100 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 rounded-xl font-black text-xs uppercase tracking-wider min-h-[44px] cursor-pointer"
                >
                  Yopish
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

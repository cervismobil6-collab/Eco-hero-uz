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
import { EcoPartner, SponsorshipProject, SponsorshipProposal } from '../types/eco';

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
    <div className="min-h-screen bg-slate-50 dark:bg-[#020617] text-slate-900 dark:text-white pb-24">
      {/* Cinematic Hero Header */}
      <div className="relative h-[400px] w-full overflow-hidden">
        <div className="absolute inset-0 z-0">
          <img 
            src="https://images.unsplash.com/photo-1552664730-d307ca884978?auto=format&fit=crop&w=2000&q=80" 
            className="w-full h-full object-cover opacity-60 dark:opacity-40 scale-110"
            alt="Eco Partners Hero"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-slate-50/0 via-slate-50/50 to-slate-50 dark:from-[#020617]/0 dark:via-[#020617]/50 dark:to-[#020617]" />
        </div>

        <div className="relative z-10 max-w-7xl mx-auto px-4 h-full flex flex-col justify-center space-y-6 pt-12">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-[10px] font-black uppercase tracking-widest"
          >
            <HeartHandshake className="w-3 h-3" /> Partnership Network
          </motion.div>
          
          <div className="space-y-2">
            <motion.h1 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="text-5xl md:text-7xl font-black uppercase tracking-tighter leading-none"
            >
              Eco <span className="text-emerald-500">Partners</span>
            </motion.h1>
            <motion.p 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="text-lg text-slate-600 dark:text-slate-400 font-medium max-w-2xl"
            >
              O'zbekiston yoshlarining ekologik tashabbuslarini qo'llab-quvvatlovchi davlat idoralari va korporativ homiylar ekotizimi.
            </motion.p>
          </div>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="flex flex-wrap items-center gap-4"
          >
             <button 
               onClick={() => setActiveTab('apply')}
               className="px-8 py-4 bg-emerald-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl shadow-emerald-600/20 hover:scale-105 active:scale-95 transition-all"
             >
               Homiy Bo'lish
             </button>
             <div className="flex items-center gap-2 px-6 py-4 bg-white dark:bg-white/5 backdrop-blur-xl rounded-2xl border border-slate-200 dark:border-white/10 shadow-xl">
               <Building2 className="w-5 h-5 text-emerald-500" />
               <span className="text-[10px] font-black uppercase tracking-widest">{partners.length} Tasdiqlangan Hamkor</span>
             </div>
          </motion.div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 -mt-16 relative z-20 space-y-12">
        {/* Navigation Tabs */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-6 p-4 bg-white dark:bg-[#0f172a] rounded-[32px] border border-slate-200 dark:border-white/5 shadow-2xl">
          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-white/5 rounded-2xl border border-slate-200 dark:border-white/5 overflow-x-auto scrollbar-hide max-w-full">
            {[
              { id: 'partners', label: 'Hamkorlar' },
              { id: 'projects', label: 'Loyihalar' },
              { id: 'apply', label: 'Ariza Berish' },
              { id: 'my_proposals', label: 'Mening Arizalarim' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${
                  activeTab === tab.id 
                    ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20' 
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex-1 max-w-md relative group w-full">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-emerald-500 transition-colors" />
            <input 
              type="text"
              placeholder="Hamkorlarni qidirish..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-11 pr-4 py-3 bg-slate-100 dark:bg-white/5 rounded-2xl text-[10px] font-black uppercase tracking-widest outline-none border border-transparent focus:border-emerald-500/50 transition-all"
            />
          </div>
        </div>

        <AnimatePresence mode="wait">
          {activeTab === 'partners' && (
            <motion.div 
              key="partners"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-10"
            >
              {/* Category Filter */}
              <div className="flex items-center gap-2 overflow-x-auto pb-4 scrollbar-hide">
                {categories.map(cat => (
                  <button
                    key={cat.id}
                    onClick={() => setPartnerCategory(cat.id)}
                    className={`px-5 py-2.5 rounded-full text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all border-2 ${
                      partnerCategory === cat.id
                        ? 'bg-emerald-600 border-emerald-600 text-white shadow-lg shadow-emerald-600/20'
                        : 'bg-white dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400 hover:border-emerald-500/50 hover:text-emerald-500'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {filteredPartners.map((partner, idx) => (
                  <motion.div
                    key={partner.id}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: idx * 0.05 }}
                    className="group bg-white dark:bg-[#0f172a] rounded-[40px] border border-slate-200 dark:border-white/5 p-8 shadow-xl hover:shadow-2xl hover:-translate-y-2 transition-all flex flex-col justify-between h-full"
                  >
                    <div className="space-y-6">
                      <div className="flex justify-between items-start">
                         <div className="w-16 h-16 rounded-[24px] bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5 flex items-center justify-center text-emerald-500 font-black text-xl shadow-inner">
                           {partner.logoText}
                         </div>
                         <div className="px-3 py-1 rounded-lg bg-emerald-500/10 text-emerald-500 text-[8px] font-black uppercase tracking-widest">
                           {partner.category}
                         </div>
                      </div>
                      <div className="space-y-2">
                        <h3 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight leading-tight">{partner.name}</h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 font-medium leading-relaxed line-clamp-3">
                          {partner.description}
                        </p>
                      </div>
                    </div>

                    <div className="mt-8 space-y-4 pt-6 border-t border-slate-100 dark:border-white/5">
                      <div className="flex justify-between items-end">
                        <div className="space-y-1">
                          <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Grant Fondi</span>
                          <div className="text-sm font-black font-mono text-emerald-500">{(partner.totalDonationUZS || 0).toLocaleString()} UZS</div>
                        </div>
                        <button 
                          onClick={() => setSelectedPartnerDetail(partner)}
                          className="p-3 bg-slate-50 dark:bg-white/5 rounded-2xl hover:bg-emerald-600 hover:text-white transition-all shadow-sm group-hover:scale-110"
                        >
                          <ArrowRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}

          {activeTab === 'apply' && (
            <motion.div 
              key="apply"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="max-w-4xl mx-auto"
            >
              <div className="p-10 md:p-16 rounded-[48px] bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-white/10 shadow-2xl space-y-12">
                 <div className="text-center space-y-4">
                    <div className="w-20 h-20 rounded-[32px] bg-emerald-500 text-white flex items-center justify-center mx-auto shadow-2xl shadow-emerald-500/20">
                       <HeartHandshake className="w-10 h-10" />
                    </div>
                    <h2 className="text-4xl font-black uppercase tracking-tighter">Homiylik Taklifi</h2>
                    <p className="text-slate-500 dark:text-slate-400 font-medium max-w-xl mx-auto">ECO HERO platformasi orqali maktablardagi yashil loyihalarni moliyalashtiring va ijtimoiy mas'uliyatli hamkorga aylaning.</p>
                 </div>

                 {submitSuccess ? (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-12 text-center bg-emerald-500/5 rounded-[40px] border border-emerald-500/20 space-y-6">
                       <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto" />
                       <h3 className="text-2xl font-black uppercase">Arizangiz yuborildi!</h3>
                       <p className="text-slate-500 font-medium">Boshqaruv jamoasi taklifingizni ko'rib chiqib, 24 soat ichida aloqaga chiqadi.</p>
                       <button onClick={() => setSubmitSuccess(false)} className="px-8 py-4 bg-emerald-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl">Yangi Ariza Yuborish</button>
                    </motion.div>
                 ) : (
                    <form onSubmit={handleSubmitProposal} className="grid grid-cols-1 md:grid-cols-2 gap-8">
                       <div className="space-y-6">
                          <div className="space-y-2">
                             <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Tashkilot Nomi</label>
                             <input required type="text" value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="Kompaniya nomi..." className="w-full p-4 bg-slate-50 dark:bg-white/5 rounded-2xl text-xs font-bold outline-none border border-transparent focus:border-emerald-500/50" />
                          </div>
                          <div className="space-y-2">
                             <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Homiylik Turi</label>
                             <select value={sponsorshipType} onChange={e => setSponsorshipType(e.target.value as any)} className="w-full p-4 bg-slate-50 dark:bg-white/5 rounded-2xl text-xs font-bold outline-none border border-transparent focus:border-emerald-500/50">
                                <option value="products">Mahsulotlar (Shop)</option>
                                <option value="funds">Pul mablag'lari</option>
                                <option value="events">Hasharlar homiyligi</option>
                             </select>
                          </div>
                          <div className="space-y-2">
                             <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Email</label>
                             <input required type="email" value={contactEmail} onChange={e => setContactEmail(e.target.value)} placeholder="Email manzili..." className="w-full p-4 bg-slate-50 dark:bg-white/5 rounded-2xl text-xs font-bold outline-none border border-transparent focus:border-emerald-500/50" />
                          </div>
                       </div>
                       <div className="space-y-6">
                          <div className="space-y-2">
                             <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Mas'ul Shaxs</label>
                             <input required type="text" value={contactPerson} onChange={e => setContactPerson(e.target.value)} placeholder="Ism va sharif..." className="w-full p-4 bg-slate-50 dark:bg-white/5 rounded-2xl text-xs font-bold outline-none border border-transparent focus:border-emerald-500/50" />
                          </div>
                          <div className="space-y-2">
                             <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Mablag' miqdori (UZS)</label>
                             <input type="number" value={fundingAmountUZS} onChange={e => setFundingAmountUZS(e.target.value)} placeholder="Masalan: 50,000,000" className="w-full p-4 bg-slate-50 dark:bg-white/5 rounded-2xl text-xs font-bold outline-none border border-transparent focus:border-emerald-500/50" />
                          </div>
                          <div className="space-y-2">
                             <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Telefon</label>
                             <input type="tel" value={contactPhone} onChange={e => setContactPhone(e.target.value)} placeholder="+998..." className="w-full p-4 bg-slate-50 dark:bg-white/5 rounded-2xl text-xs font-bold outline-none border border-transparent focus:border-emerald-500/50" />
                          </div>
                       </div>
                       <div className="md:col-span-2 space-y-2">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Loyiha Tafsilotlari</label>
                          <textarea rows={4} value={proposalDetails} onChange={e => setProposalDetails(e.target.value)} placeholder="Qanday yordam bermoqchisiz? (Velosipedlar, IT vaucherlar, Ko'chatlar...)" className="w-full p-4 bg-slate-50 dark:bg-white/5 rounded-2xl text-xs font-bold outline-none border border-transparent focus:border-emerald-500/50 resize-none" />
                       </div>
                       <div className="md:col-span-2 pt-6">
                          <button disabled={isSubmitting} type="submit" className="w-full py-5 bg-emerald-600 text-white rounded-[24px] font-black text-[11px] uppercase tracking-widest shadow-xl shadow-emerald-600/20 active:scale-95 transition-all">
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
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="grid grid-cols-1 md:grid-cols-2 gap-8"
            >
               {sponsorshipProjects.map(project => (
                 <div key={project.id} className="group bg-white dark:bg-[#0f172a] rounded-[48px] border border-slate-200 dark:border-white/10 overflow-hidden shadow-2xl flex flex-col">
                    <div className="relative h-64 overflow-hidden">
                       <img src={project.imageUrl} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" alt="" />
                       <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                       <div className="absolute top-8 left-8 flex flex-col gap-2">
                          <div className="px-4 py-1.5 rounded-full bg-emerald-500 text-white text-[10px] font-black uppercase tracking-widest shadow-lg">{project.category}</div>
                          <div className="px-4 py-1.5 rounded-full bg-white/20 backdrop-blur-md border border-white/20 text-white text-[10px] font-black uppercase tracking-widest">{project.partnerName}</div>
                       </div>
                       <div className="absolute bottom-8 left-8 right-8 space-y-4">
                          <h3 className="text-2xl font-black text-white uppercase tracking-tight leading-none">{project.title}</h3>
                          <div className="space-y-2">
                             <div className="flex justify-between text-[9px] font-black text-white/60 uppercase tracking-widest">
                                <span>Funds Raised</span>
                                <span>{Math.round((project.raisedAmountUZS / project.targetAmountUZS) * 100)}%</span>
                             </div>
                             <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                                <motion.div initial={{ width: 0 }} animate={{ width: `${(project.raisedAmountUZS / project.targetAmountUZS) * 100}%` }} className="h-full bg-emerald-500" />
                             </div>
                          </div>
                       </div>
                    </div>
                    <div className="p-10 space-y-8 flex-1 flex flex-col">
                       <p className="text-xs text-slate-500 dark:text-slate-400 font-medium leading-relaxed flex-1">
                          {project.description}
                       </p>
                       <div className="grid grid-cols-2 gap-4 py-6 border-y border-slate-100 dark:border-white/5">
                          <div className="space-y-1">
                             <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Schools Helped</div>
                             <div className="text-lg font-black text-slate-900 dark:text-white font-mono">{project.schoolsBenefited}</div>
                          </div>
                          <div className="space-y-1">
                             <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Impact Status</div>
                             <div className="text-lg font-black text-emerald-500 uppercase tracking-tight">{project.treesPlantedOrImpact}</div>
                          </div>
                       </div>
                       <button className="w-full py-4 bg-slate-50 dark:bg-white/5 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-600 hover:text-white transition-all">Loyiha Tafsilotlari</button>
                    </div>
                 </div>
               ))}
            </motion.div>
          )}

          {activeTab === 'my_proposals' && (
            <motion.div key="my_proposals" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
               <div className="flex items-center justify-between mb-8">
                  <h2 className="text-2xl font-black uppercase tracking-tighter">Arizalar Tarixi</h2>
                  <div className="flex items-center gap-2 text-slate-400 text-[10px] font-black uppercase tracking-widest"><Clock className="w-4 h-4" /> {sponsorshipProposals.length} ta yozuv</div>
               </div>
               {sponsorshipProposals.map(prop => (
                 <div key={prop.id} className="bg-white dark:bg-[#0f172a] rounded-[32px] border border-slate-200 dark:border-white/10 p-8 shadow-xl space-y-6">
                    <div className="flex justify-between items-start">
                       <div className="space-y-1">
                          <h4 className="text-lg font-black uppercase tracking-tight">{prop.companyName}</h4>
                          <div className="flex items-center gap-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                             <span>{prop.contactPerson}</span>
                             <span>•</span>
                             <span>{new Date(prop.submittedAt).toLocaleDateString()}</span>
                          </div>
                       </div>
                       <div className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest ${
                         prop.status === 'approved' ? 'bg-emerald-500 text-white' : 
                         prop.status === 'rejected' ? 'bg-rose-500 text-white' : 'bg-amber-500 text-white'
                       }`}>
                          {prop.status}
                       </div>
                    </div>
                    <div className="p-5 bg-slate-50 dark:bg-white/5 rounded-2xl text-xs font-medium text-slate-600 dark:text-slate-300 italic leading-relaxed border border-slate-100 dark:border-white/5">
                       "{prop.proposalDetails}"
                    </div>
                    {prop.adminNotes && (
                      <div className="p-5 bg-emerald-500/5 rounded-2xl border border-emerald-500/10 space-y-2">
                         <div className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Administrator Izohi</div>
                         <p className="text-xs font-bold text-emerald-900 dark:text-emerald-100">{prop.adminNotes}</p>
                      </div>
                    )}
                 </div>
               ))}
               {sponsorshipProposals.length === 0 && (
                 <div className="p-20 text-center bg-white dark:bg-[#0f172a] rounded-[48px] border border-slate-200 dark:border-white/5 text-slate-300 space-y-4">
                    <Package className="w-16 h-16 mx-auto opacity-20" />
                    <p className="text-sm font-black uppercase tracking-widest">Hali hech qanday ariza yuborilmagan</p>
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
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSelectedPartnerDetail(null)} className="absolute inset-0 bg-black/80 backdrop-blur-xl" />
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className="relative w-full max-w-2xl bg-white dark:bg-[#0f172a] rounded-[48px] p-10 md:p-16 shadow-2xl space-y-10">
               <div className="flex justify-between items-start">
                  <div className="flex items-center gap-6">
                     <div className="w-20 h-20 rounded-[32px] bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 flex items-center justify-center font-black text-2xl uppercase">{selectedPartnerDetail.logoText}</div>
                     <div>
                        <h3 className="text-2xl font-black uppercase tracking-tighter">{selectedPartnerDetail.name}</h3>
                        <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">{selectedPartnerDetail.category}</p>
                     </div>
                  </div>
                  <button onClick={() => setSelectedPartnerDetail(null)} className="p-4 bg-slate-50 dark:bg-white/5 rounded-full text-slate-400 hover:text-white transition-all"><X className="w-6 h-6" /></button>
               </div>

               <div className="space-y-6">
                  <div className="text-sm font-medium text-slate-600 dark:text-slate-400 leading-relaxed">
                     {selectedPartnerDetail.description}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                     <div className="p-5 bg-slate-50 dark:bg-white/5 rounded-[32px] border border-slate-100 dark:border-white/5 space-y-4">
                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Bog'lanish</h4>
                        <div className="space-y-3">
                           <div className="flex items-center gap-3 text-xs font-bold"><Mail className="w-4 h-4 text-emerald-500" /> {selectedPartnerDetail.contactEmail}</div>
                           <div className="flex items-center gap-3 text-xs font-bold"><Phone className="w-4 h-4 text-emerald-500" /> {selectedPartnerDetail.contactPhone}</div>
                           <div className="flex items-center gap-3 text-xs font-bold"><User className="w-4 h-4 text-emerald-500" /> {selectedPartnerDetail.contactPerson}</div>
                        </div>
                     </div>
                     <div className="p-5 bg-slate-50 dark:bg-white/5 rounded-[32px] border border-slate-100 dark:border-white/5 space-y-4">
                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Statistika</h4>
                        <div className="space-y-3">
                           <div className="flex justify-between items-center text-xs font-bold"><span>Verified Sponsor</span> <CheckCircle2 className="w-4 h-4 text-emerald-500" /></div>
                           <div className="flex justify-between items-center text-xs font-bold"><span>Products</span> <span className="text-emerald-500">{selectedPartnerDetail.sponsoredProductsCount} items</span></div>
                           <div className="flex justify-between items-center text-xs font-bold"><span>Impact</span> <span className="text-emerald-500">{selectedPartnerDetail.projectsSupported}</span></div>
                        </div>
                     </div>
                  </div>
               </div>

               <div className="flex gap-4">
                  <a href={selectedPartnerDetail.website} target="_blank" rel="noreferrer" className="flex-1 py-5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-[24px] font-black text-[11px] uppercase tracking-widest text-center shadow-xl">Veb-saytga O'tish</a>
                  <button onClick={() => setSelectedPartnerDetail(null)} className="px-10 py-5 bg-slate-100 dark:bg-white/5 rounded-[24px] font-black text-[10px] uppercase tracking-widest">Yopish</button>
               </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

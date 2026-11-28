import React, { useMemo, useState } from 'react';
import {
  Map as MapIcon,
  MapPin,
  Building2,
  GraduationCap,
  CheckCircle2,
  AlertTriangle,
  Users,
  Layers,
  ArrowRight,
  Coins,
  TreePine,
} from 'lucide-react';
import type { FeatureCollection } from 'geojson';
import {
  EcologicalLayerId,
  EcoReport,
  MapImageryProvider,
  RegionalDistrictSummary,
  RegionalSectionId,
  School,
} from '../../../types/eco';
import { EcoMapLibre2D, FlyToTarget } from '../../map/EcoMapLibre2D';
import { getDistrictApproxCoords, REGION_COORDINATES } from './regionalTypes';
import regionalMapOverviewImg from '../../../assets/images/regional_map_overview_1795859012323.jpg';
import realisticAvatarImg from '../../../assets/images/profile_avatar_realistic_1795605008121.jpg';

const DEFAULT_OSM_PROVIDER: MapImageryProvider = {
  id: 'street',
  name: 'OpenStreetMap',
  tileUrls: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
  attribution: '© OpenStreetMap contributors',
  maxZoom: 19,
  isPaid: false,
  isLiveImagery: true,
  licenseNote: 'OpenStreetMap free raster tiles',
};

const EMPTY_FC: FeatureCollection = { type: 'FeatureCollection', features: [] };

interface RegionalMapSectionProps {
  region: string;
  districts: RegionalDistrictSummary[];
  schools: School[];
  reports: EcoReport[];
  onInspectDistrictReports: (district: string) => void;
  onInspectDistrictSchools: (district: string) => void;
  onNavigateSection: (section: RegionalSectionId) => void;
}

export const RegionalMapSection: React.FC<RegionalMapSectionProps> = ({
  region,
  districts,
  schools,
  reports,
  onInspectDistrictReports,
  onInspectDistrictSchools,
  onNavigateSection,
}) => {
  const [mapMode, setMapMode] = useState<'interactive_grid' | 'geo_map'>('interactive_grid');
  const [selectedDistrictName, setSelectedDistrictName] = useState<string>(
    districts[0]?.district || ''
  );
  const [activityFilter, setActivityFilter] = useState<'all' | 'high' | 'medium' | 'low' | 'has_problems'>('all');
  const [flyTarget, setFlyTarget] = useState<FlyToTarget | null>(null);

  const selectedDistrict = useMemo(
    () =>
      districts.find(d => d.district === selectedDistrictName) ||
      districts[0] ||
      null,
    [districts, selectedDistrictName]
  );

  const filteredDistricts = useMemo(() => {
    return districts.filter(d => {
      if (activityFilter === 'all') return true;
      if (activityFilter === 'has_problems') return d.pendingReports > 0 || d.escalatedReports > 0;
      return d.activityLevel === activityFilter;
    });
  }, [districts, activityFilter]);

  const regionCenter = REGION_COORDINATES[region] || { lat: 41.2995, lng: 69.2401, zoom: 9.2 };

  const districtNodes = useMemo(() => {
    return districts.map((d, idx) => {
      const distSchools = schools.filter(
        s => s.district?.toLowerCase() === d.district.toLowerCase()
      );
      const coords = getDistrictApproxCoords(region, d.district, idx, districts.length, distSchools);
      const angle = (idx / Math.max(1, districts.length)) * Math.PI * 2 - Math.PI / 2;
      const ring = idx % 2 === 0 ? 35 : 22;
      const svgX = Number((50 + Math.cos(angle) * ring).toFixed(2));
      const svgY = Number((50 + Math.sin(angle) * (ring * 0.85)).toFixed(2));
      return { ...d, coords, svgX, svgY };
    });
  }, [districts, schools, region]);

  const schoolsGeoJson = useMemo<FeatureCollection>(() => {
    return {
      type: 'FeatureCollection',
      features: schools
        .filter(s => typeof s.lat === 'number' && typeof s.lng === 'number' && s.lat !== 0)
        .map(s => ({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [Number(s.lng), Number(s.lat)] },
          properties: {
            id: s.id,
            name: s.name,
            totalCoins: s.totalCoins || 0,
            environmentalScore: s.environmentalScore || 75,
          },
        })),
    };
  }, [schools]);

  const reportsGeoJson = useMemo<FeatureCollection>(() => {
    return {
      type: 'FeatureCollection',
      features: reports
        .filter(r => typeof r.lat === 'number' && typeof r.lng === 'number' && r.lat !== 0 && r.lng !== 0)
        .map(r => ({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [Number(r.lng), Number(r.lat)] },
          properties: {
            id: r.id,
            title: r.title,
            category: r.category,
            status: r.status,
            severity: r.severity,
          },
        })),
    };
  }, [reports]);

  const schoolsById = useMemo(() => {
    const m = new Map<string, School>();
    for (const s of schools) m.set(s.id, s);
    return m;
  }, [schools]);

  const reportsById = useMemo(() => {
    const m = new Map<string, EcoReport>();
    for (const r of reports) m.set(r.id, r);
    return m;
  }, [reports]);

  const enabledLayers = useMemo<Record<EcologicalLayerId, boolean>>(
    () => ({
      schools: true,
      green_spaces: false,
      trees: false,
      waste_reports: true,
      water_reports: true,
      problem_locations: true,
      school_rankings: false,
      eco_heatmap: true,
      district_boundaries: true,
    }),
    []
  );

  const handleSelectNode = (node: typeof districtNodes[number]) => {
    setSelectedDistrictName(node.district);
    setFlyTarget({
      lat: node.coords.lat,
      lng: node.coords.lng,
      zoom: 11.8,
      ts: Date.now(),
    });
  };

  const selectedDistrictSchools = useMemo(() => {
    if (!selectedDistrict) return [];
    return schools
      .filter(s => s.district?.toLowerCase() === selectedDistrict.district.toLowerCase())
      .sort((a, b) => (b.totalCoins || 0) - (a.totalCoins || 0));
  }, [schools, selectedDistrict]);

  const selectedDistrictReports = useMemo(() => {
    if (!selectedDistrict) return [];
    return reports.filter(r => r.district?.toLowerCase() === selectedDistrict.district.toLowerCase());
  }, [reports, selectedDistrict]);

  return (
    <div className="space-y-4">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-2xl border border-emerald-500/25 bg-[#051811] text-white">
        <img
          src={regionalMapOverviewImg}
          alt={region}
          className="absolute inset-0 w-full h-full object-cover opacity-30"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#04110B]/95 via-[#051811]/85 to-[#061812]/70" />
        <div className="relative p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-0.5">
            <div className="text-[11px] font-black uppercase tracking-wider text-[#00F5A0]">
              Hududiy Ekologik Xarita · {region}
            </div>
            <h3 className="text-base sm:text-lg font-extrabold">
              Tuman va shaharlar faolligi hamda ekologik muammolar xaritasi
            </h3>
            <p className="text-xs text-emerald-100/75">
              Istalgan tumanni bosing — maktablar, muammolar soni va koordinator statistikasi darhol ochiladi.
            </p>
          </div>

          <div className="flex items-center gap-1.5 bg-[#040D0A]/85 p-1 rounded-xl border border-emerald-500/25 shrink-0">
            <button
              type="button"
              onClick={() => setMapMode('interactive_grid')}
              className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer ${
                mapMode === 'interactive_grid'
                  ? 'bg-gradient-to-r from-[#00F5A0] to-[#10B981] text-[#04110B]'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Hududiy sxema</span>
            </button>
            <button
              type="button"
              onClick={() => setMapMode('geo_map')}
              className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer ${
                mapMode === 'geo_map'
                  ? 'bg-gradient-to-r from-[#00F5A0] to-[#10B981] text-[#04110B]'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <MapIcon className="w-3.5 h-3.5" />
              <span>Jonli 2D Xarita</span>
            </button>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-2">
        {[
          { id: 'all' as const, label: `Barchasi (${districts.length})` },
          { id: 'high' as const, label: 'Yuqori faollik' },
          { id: 'medium' as const, label: "O'rta faollik" },
          { id: 'low' as const, label: 'Past faollik' },
          { id: 'has_problems' as const, label: 'Faol muammolar bor' },
        ].map(f => (
          <button
            key={f.id}
            type="button"
            onClick={() => setActivityFilter(f.id)}
            className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
              activityFilter === f.id
                ? 'bg-emerald-500/15 border-emerald-500 text-emerald-500'
                : 'bg-white dark:bg-[#061812] border-slate-200 dark:border-emerald-500/20 text-slate-600 dark:text-slate-300'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Main Split: Interactive Map Canvas + District Telemetry Drawer */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-7 rounded-2xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 overflow-hidden">
          {mapMode === 'interactive_grid' ? (
            <div className="p-4 space-y-4">
              {/* Interactive Spatial Hub Graph */}
              <div className="relative h-[320px] sm:h-[380px] rounded-2xl bg-[#040D0A] border border-emerald-500/25 overflow-hidden">
                <img
                  src={regionalMapOverviewImg}
                  alt="Regional Spatial Canvas"
                  className="absolute inset-0 w-full h-full object-cover opacity-20"
                />
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(0,245,160,0.12)_0%,rgba(4,13,10,0.92)_72%)]" />

                <svg viewBox="0 0 100 100" className="relative w-full h-full select-none">
                  {/* Radial lines from regional core to each district */}
                  {districtNodes.map(node => {
                    const isSelected = node.district === selectedDistrict?.district;
                    return (
                      <line
                        key={`line_${node.district}`}
                        x1="50"
                        y1="50"
                        x2={node.svgX}
                        y2={node.svgY}
                        stroke={isSelected ? '#00F5A0' : 'rgba(16,185,129,0.28)'}
                        strokeWidth={isSelected ? '0.65' : '0.35'}
                        strokeDasharray={node.coordinator ? undefined : '1.2 1.2'}
                      />
                    );
                  })}

                  {/* Regional Center Hub */}
                  <circle cx="50" cy="50" r="5.5" fill="#061812" stroke="#00F5A0" strokeWidth="0.9" />
                  <text
                    x="50"
                    y="50.8"
                    textAnchor="middle"
                    fill="#00F5A0"
                    fontSize="2.3"
                    fontWeight="800"
                  >
                    VILOYAT
                  </text>

                  {/* District Nodes */}
                  {districtNodes
                    .filter(n => filteredDistricts.some(fd => fd.district === n.district))
                    .map(node => {
                      const isSelected = node.district === selectedDistrict?.district;
                      const dotFill =
                        node.activityLevel === 'high'
                          ? '#00F5A0'
                          : node.activityLevel === 'medium'
                          ? '#38BDF8'
                          : '#F59E0B';
                      const shortName = node.district.replace(/ tumani| shahri/gi, '');
                      return (
                        <g
                          key={node.district}
                          onClick={() => handleSelectNode(node)}
                          className="cursor-pointer"
                        >
                          {isSelected && (
                            <circle
                              cx={node.svgX}
                              cy={node.svgY}
                              r="5.6"
                              fill="rgba(0,245,160,0.18)"
                              stroke="#00F5A0"
                              strokeWidth="0.5"
                            />
                          )}
                          <circle
                            cx={node.svgX}
                            cy={node.svgY}
                            r={isSelected ? '3.3' : '2.6'}
                            fill={dotFill}
                            stroke="#04110B"
                            strokeWidth="0.6"
                          />
                          {node.pendingReports > 0 && (
                            <circle
                              cx={node.svgX + 2.4}
                              cy={node.svgY - 2.4}
                              r="1.4"
                              fill={node.escalatedReports > 0 ? '#F43F5E' : '#F59E0B'}
                            />
                          )}
                          <text
                            x={node.svgX}
                            y={node.svgY + 5.8}
                            textAnchor="middle"
                            fill={isSelected ? '#FFFFFF' : '#CBD5E1'}
                            fontSize="2.35"
                            fontWeight={isSelected ? '800' : '600'}
                          >
                            {shortName}
                          </text>
                        </g>
                      );
                    })}
                </svg>

                {/* Legend */}
                <div className="absolute bottom-2.5 left-2.5 right-2.5 flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-xl bg-[#040D0A]/90 border border-emerald-500/20 text-[10px] text-slate-300">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#00F5A0]" /> Yuqori faollik
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-sky-400" /> O&apos;rta
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-400" /> Past
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-rose-500" /> Muammo bor
                    </span>
                  </div>
                  <span className="font-mono text-emerald-400 tabular-nums">
                    {filteredDistricts.length} tuman ko‘rsatilmoqda
                  </span>
                </div>
              </div>

              {/* Clickable District Chips Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-56 overflow-y-auto pr-1">
                {filteredDistricts.map(d => {
                  const active = d.district === selectedDistrict?.district;
                  return (
                    <button
                      key={d.district}
                      type="button"
                      onClick={() => {
                        const node = districtNodes.find(n => n.district === d.district);
                        if (node) handleSelectNode(node);
                        else setSelectedDistrictName(d.district);
                      }}
                      className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                        active
                          ? 'bg-emerald-500/15 border-emerald-500 text-slate-900 dark:text-white'
                          : 'bg-slate-50 dark:bg-[#040D0A] border-slate-200 dark:border-emerald-500/20 hover:border-emerald-400/50'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1 text-xs font-bold truncate">
                        <span className="truncate">{d.district}</span>
                        <span
                          className={`w-2 h-2 rounded-full shrink-0 ${
                            d.activityLevel === 'high'
                              ? 'bg-emerald-500'
                              : d.activityLevel === 'medium'
                              ? 'bg-sky-400'
                              : 'bg-amber-400'
                          }`}
                        />
                      </div>
                      <div className="text-[10px] font-mono tabular-nums text-slate-500 mt-0.5">
                        {d.schoolsCount} maktab · {d.pendingReports} faol muammo
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="h-[460px] sm:h-[540px] relative">
              <EcoMapLibre2D
                baseStyle="street"
                provider={DEFAULT_OSM_PROVIDER}
                enabledLayers={enabledLayers}
                initialCenter={[regionCenter.lng, regionCenter.lat]}
                initialZoom={regionCenter.zoom}
                isTilted25D={false}
                boundariesGeoJson={EMPTY_FC}
                greenSpacesGeoJson={EMPTY_FC}
                treesGeoJson={EMPTY_FC}
                schoolsGeoJson={schoolsGeoJson}
                reportsGeoJson={reportsGeoJson}
                heatmapGeoJson={reportsGeoJson}
                schoolsById={schoolsById}
                reportsById={reportsById}
                selectedSchoolId={null}
                selectedReportId={null}
                clickedCoords={null}
                userLocation={null}
                flyToTarget={flyTarget}
                zoomAction={null}
                onSelectSchool={sch => {
                  if (sch.district) setSelectedDistrictName(sch.district);
                }}
                onSelectReport={rep => {
                  if (rep.district) setSelectedDistrictName(rep.district);
                }}
                onMapClickCoords={() => {}}
                onTileFallback={() => {}}
              />
            </div>
          )}
        </div>

        {/* District Detail Telemetry Drawer */}
        <div className="lg:col-span-5 p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 space-y-4">
          {!selectedDistrict ? (
            <div className="py-12 text-center text-xs text-slate-500">
              Xaritadan tuman yoki shaharni tanlang.
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-2 pb-3 border-b border-slate-200 dark:border-emerald-500/15">
                <div className="space-y-0.5 min-w-0">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-500 flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5" />
                    <span>Tanlangan hudud</span>
                  </div>
                  <h4 className="text-lg font-black text-slate-900 dark:text-white truncate">
                    {selectedDistrict.district}
                  </h4>
                  <p className="text-xs text-slate-500">
                    Faollik darajasi:{' '}
                    <b
                      className={
                        selectedDistrict.activityLevel === 'high'
                          ? 'text-emerald-500'
                          : selectedDistrict.activityLevel === 'medium'
                          ? 'text-sky-500'
                          : 'text-amber-500'
                      }
                    >
                      {selectedDistrict.activityLevel === 'high'
                        ? 'Yuqori'
                        : selectedDistrict.activityLevel === 'medium'
                        ? "O'rta"
                        : 'Past'}
                    </b>
                  </p>
                </div>
              </div>

              {/* Coordinator Info */}
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 flex items-center gap-3">
                <img
                  src={selectedDistrict.coordinator?.avatarUrl || realisticAvatarImg}
                  alt={selectedDistrict.coordinator?.fullName || selectedDistrict.district}
                  className="w-10 h-10 rounded-full object-cover border border-emerald-500/40 shrink-0"
                />
                <div className="min-w-0">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Tuman Koordinatori
                  </div>
                  <div className="text-xs font-extrabold text-slate-900 dark:text-white truncate">
                    {selectedDistrict.coordinator
                      ? selectedDistrict.coordinator.fullName
                      : 'Hali tayinlanmagan'}
                  </div>
                  {selectedDistrict.coordinator && (
                    <div className="text-[11px] text-slate-500 truncate">
                      {selectedDistrict.coordinator.telegramUsername ||
                        selectedDistrict.coordinator.phoneNumber ||
                        'Aloqa'}
                    </div>
                  )}
                </div>
              </div>

              {/* Metrics Grid */}
              <div className="grid grid-cols-2 gap-2.5 text-xs">
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/15 space-y-0.5">
                  <div className="text-[11px] text-slate-500 flex items-center gap-1">
                    <Building2 className="w-3.5 h-3.5 text-emerald-500" />
                    <span>Maktablar</span>
                  </div>
                  <div className="text-lg font-black font-mono tabular-nums">
                    {selectedDistrict.schoolsCount}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/15 space-y-0.5">
                  <div className="text-[11px] text-slate-500 flex items-center gap-1">
                    <GraduationCap className="w-3.5 h-3.5 text-sky-500" />
                    <span>O‘quvchilar</span>
                  </div>
                  <div className="text-lg font-black font-mono tabular-nums">
                    {selectedDistrict.studentsCount.toLocaleString()}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/15 space-y-0.5">
                  <div className="text-[11px] text-slate-500 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Hal etilgan / Jami</span>
                  </div>
                  <div className="text-lg font-black font-mono tabular-nums text-emerald-500">
                    {selectedDistrict.resolvedReports} / {selectedDistrict.totalReports}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/15 space-y-0.5">
                  <div className="text-[11px] text-slate-500 flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
                    <span>Kutilayotgan muammo</span>
                  </div>
                  <div className="text-lg font-black font-mono tabular-nums text-amber-500">
                    {selectedDistrict.pendingReports}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/15 space-y-0.5">
                  <div className="text-[11px] text-slate-500 flex items-center gap-1">
                    <Coins className="w-3.5 h-3.5 text-amber-500" />
                    <span>Jami EcoCoin</span>
                  </div>
                  <div className="text-lg font-black font-mono tabular-nums text-amber-500">
                    {selectedDistrict.totalCoins.toLocaleString()}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/15 space-y-0.5">
                  <div className="text-[11px] text-slate-500 flex items-center gap-1">
                    <TreePine className="w-3.5 h-3.5 text-emerald-500" />
                    <span>Ko‘chatlar · Elchilar</span>
                  </div>
                  <div className="text-lg font-black font-mono tabular-nums">
                    {selectedDistrict.treesPlanted} · {selectedDistrict.ambassadorsCount}
                  </div>
                </div>
              </div>

              {/* Top Schools & Recent Reports Preview */}
              <div className="space-y-2">
                <div className="text-xs font-extrabold text-slate-700 dark:text-slate-200">
                  Tumandagi faol maktablar ({selectedDistrictSchools.length})
                </div>
                {selectedDistrictSchools.length === 0 ? (
                  <p className="text-[11px] text-slate-500">Hozircha ro‘yxatga olingan maktab yo‘q.</p>
                ) : (
                  <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1">
                    {selectedDistrictSchools.slice(0, 4).map(s => (
                      <div
                        key={s.id}
                        className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200/70 dark:border-emerald-500/15 flex items-center justify-between text-xs"
                      >
                        <span className="font-semibold truncate">{s.name}</span>
                        <span className="font-mono tabular-nums font-bold text-amber-500 shrink-0">
                          {(s.totalCoins || 0).toLocaleString()} ECO
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => onInspectDistrictReports(selectedDistrict.district)}
                  className="flex-1 min-h-[42px] px-3 py-2 rounded-xl bg-gradient-to-r from-[#00F5A0] to-[#10B981] text-[#04110B] text-xs font-black border-b-[3px] border-emerald-700 inline-flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <span>Muammolarni ko‘rish ({selectedDistrictReports.length})</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onInspectDistrictSchools(selectedDistrict.district)}
                  className="min-h-[42px] px-3 py-2 rounded-xl bg-slate-100 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Users className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Maktablar</span>
                </button>
                {!selectedDistrict.coordinator && (
                  <button
                    type="button"
                    onClick={() => onNavigateSection('regional_coordinators')}
                    className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-amber-500/15 text-amber-500 text-xs font-bold cursor-pointer"
                  >
                    Ushbu tumanga koordinator tayinlash
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  RegionalAnnouncementRecord,
  RegionalCommandSummaryResponse,
  RegionalSectionId,
  RosterAmbassadorEntry,
  RosterCaptainEntry,
  RosterCoordinatorEntry,
  RosterStudentEntry,
} from '../../types/eco';
import { useEco } from '../../context/EcoContext';
import { REGIONAL_MENU_ITEMS } from './regional/regionalTypes';
import { RegionalOverviewSection } from './regional/RegionalOverviewSection';
import { RegionalCoordinatorsSection } from './regional/RegionalCoordinatorsSection';
import { RegionalMapSection } from './regional/RegionalMapSection';
import { RegionalSchoolsStudentsSection } from './regional/RegionalSchoolsStudentsSection';
import { RegionalEcoControlSection } from './regional/RegionalEcoControlSection';
import { RegionalChampionshipSection } from './regional/RegionalChampionshipSection';
import { RegionalAnnouncementsSection } from './regional/RegionalAnnouncementsSection';
import { RegionalAnalyticsSection } from './regional/RegionalAnalyticsSection';
import { RegionalAiAnalystSection } from './regional/RegionalAiAnalystSection';
import { UZBEKISTAN_REGIONS } from '../../data/mockData';

interface RegionalCoordinatorDashboardViewProps {
  activeSection?: RegionalSectionId;
  onNavigateSection?: (section: RegionalSectionId) => void;
  globalSearchQuery?: string;
}

export const RegionalCoordinatorDashboardView: React.FC<RegionalCoordinatorDashboardViewProps> = ({
  activeSection,
  onNavigateSection,
  globalSearchQuery = '',
}) => {
  const {
    user,
    schools,
    reports,
    registrationApplications,
    monthlyAwards,
    notifications,
    auditLogs,
    liveSyncVersion,
    fetchRegionalCommandSummary,
    fetchRosterDirectory,
    fetchRegionalAnnouncements,
    fetchRegionalAnalytics,
    appointDistrictCoordinator,
    reviewApplication,
    manageRegionalCoordinator,
    dispatchRegionalReport,
    sendRegionalAnnouncement,
    awardRegionalChampionship,
    askRegionalAiAnalyst,
    registerSchool,
    updateDistrictSchool,
    markNotificationRead,
    apiFetch,
  } = useEco();

  const [internalSection, setInternalSection] = useState<RegionalSectionId>('regional_overview');
  const [superAdminRegionFilter, setSuperAdminRegionFilter] = useState<string>(
    user.region || UZBEKISTAN_REGIONS[0]
  );

  const isSuperAdminViewer = user.role === 'super_admin';
  const targetRegion = isSuperAdminViewer ? superAdminRegionFilter : user.region;
  const currentSection = activeSection || internalSection;

  const [summary, setSummary] = useState<RegionalCommandSummaryResponse | null>(null);
  const [coordinators, setCoordinators] = useState<RosterCoordinatorEntry[]>([]);
  const [captains, setCaptains] = useState<RosterCaptainEntry[]>([]);
  const [ambassadors, setAmbassadors] = useState<RosterAmbassadorEntry[]>([]);
  const [students, setStudents] = useState<RosterStudentEntry[]>([]);
  const [announcements, setAnnouncements] = useState<RegionalAnnouncementRecord[]>([]);

  // Cross-section drill-down district filters (from Map / Coordinators)
  const [ecoControlDistrictFilter, setEcoControlDistrictFilter] = useState<string>('all');
  const [schoolsDistrictFilter, setSchoolsDistrictFilter] = useState<string>('all');

  const navigate = useCallback(
    (next: RegionalSectionId) => {
      if (onNavigateSection) onNavigateSection(next);
      else setInternalSection(next);
    },
    [onNavigateSection]
  );

  const loadAll = useCallback(async () => {
    const [sumRes, rosterRes, annRes] = await Promise.all([
      fetchRegionalCommandSummary(isSuperAdminViewer ? targetRegion : undefined),
      fetchRosterDirectory({ region: targetRegion }),
      fetchRegionalAnnouncements(),
    ]);

    if (sumRes) setSummary(sumRes);
    if (rosterRes) {
      setCoordinators(rosterRes.districtCoordinators || []);
      setCaptains(rosterRes.districtCaptains || []);
      setAmbassadors(rosterRes.districtAmbassadors || []);
      setStudents(rosterRes.districtStudents || []);
    }
    if (Array.isArray(annRes)) setAnnouncements(annRes);
  }, [
    fetchRegionalCommandSummary,
    fetchRosterDirectory,
    fetchRegionalAnnouncements,
    isSuperAdminViewer,
    targetRegion,
  ]);

  useEffect(() => {
    loadAll();
  }, [loadAll, liveSyncVersion]);

  const regionalSchools = useMemo(() => {
    const norm = (targetRegion || '').trim().toLowerCase();
    return schools
      .filter(s => (s.region || '').trim().toLowerCase() === norm)
      .sort((a, b) => (b.totalCoins || 0) - (a.totalCoins || 0));
  }, [schools, targetRegion]);

  const regionalReports = useMemo(() => {
    const norm = (targetRegion || '').trim().toLowerCase();
    return reports.filter(r => (r.region || '').trim().toLowerCase() === norm);
  }, [reports, targetRegion]);

  const incomingApplications = useMemo(() => {
    const norm = (targetRegion || '').trim().toLowerCase();
    return registrationApplications.filter(
      a =>
        ['pending', 'needs_info'].includes(a.status) &&
        ['district_coordinator', 'school_admin', 'ambassador'].includes(a.requestedRole) &&
        (a.region || '').trim().toLowerCase() === norm
    );
  }, [registrationApplications, targetRegion]);

  const mergedAuditLogs = useMemo(() => {
    const norm = (targetRegion || '').trim().toLowerCase();
    const fromSummary = summary?.recentAuditLogs || [];
    if (fromSummary.length > 0) return fromSummary;
    return auditLogs.filter(l => String(l.details?.region || '').trim().toLowerCase() === norm).slice(0, 40);
  }, [summary?.recentAuditLogs, auditLogs, targetRegion]);

  const handleInspectDistrictReports = useCallback(
    (district: string) => {
      setEcoControlDistrictFilter(district || 'all');
      navigate('regional_eco_control');
    },
    [navigate]
  );

  const handleInspectDistrictSchools = useCallback(
    (district: string) => {
      setSchoolsDistrictFilter(district || 'all');
      navigate('regional_schools_students');
    },
    [navigate]
  );

  const handleRegisterSchoolWrapper = useCallback(
    (data: {
      name: string;
      number: string;
      region: string;
      district: string;
      address?: string;
      ambassadorName: string;
      registeredStudentsCount: number;
    }) => {
      registerSchool({
        name: data.name,
        number: data.number,
        region: data.region || targetRegion,
        district: data.district,
        address: data.address || `${data.district}, ${data.region || targetRegion}`,
        ambassadorName: data.ambassadorName,
        registeredStudentsCount: data.registeredStudentsCount,
      });
      window.setTimeout(() => loadAll(), 350);
    },
    [registerSchool, targetRegion, loadAll]
  );

  const handleUpdateSchoolWrapper = useCallback(
    async (
      schoolId: string,
      updates: {
        name?: string;
        number?: string;
        address?: string;
        status?: 'verified' | 'pending';
        ambassadorName?: string;
      }
    ) => {
      const res = await updateDistrictSchool(schoolId, updates);
      if (res.success) await loadAll();
      return { success: res.success };
    },
    [updateDistrictSchool, loadAll]
  );

  const handleAppointWrapper = useCallback(
    async (payload: {
      fullName: string;
      phoneNumber?: string;
      telegramUsername?: string;
      email?: string;
      district: string;
      region?: string;
    }) => {
      const res = await appointDistrictCoordinator({
        ...payload,
        region: payload.region || targetRegion,
      });
      if (res.success) await loadAll();
      return { success: res.success };
    },
    [appointDistrictCoordinator, targetRegion, loadAll]
  );

  const handleReviewAppWrapper = useCallback(
    async (appId: string, action: 'approve' | 'reject' | 'request_info', note?: string) => {
      const res = await reviewApplication(appId, action, note);
      if (res.success) await loadAll();
      return { success: res.success };
    },
    [reviewApplication, loadAll]
  );

  const handleManageCoordWrapper = useCallback(
    async (
      uid: string,
      payload: {
        action: 'reassign' | 'suspend' | 'activate' | 'revoke' | 'update_contact';
        district?: string;
        reason?: string;
        phoneNumber?: string;
        telegramUsername?: string;
      }
    ) => {
      const res = await manageRegionalCoordinator(uid, payload);
      if (res.success) await loadAll();
      return res;
    },
    [manageRegionalCoordinator, loadAll]
  );

  const handleDispatchWrapper = useCallback(
    async (
      reportId: string,
      action: 'dispatch_to_district' | 'verify' | 'resolve' | 'escalate' | 'request_info' | 'reject',
      payload?: { note?: string; targetDistrict?: string }
    ) => {
      const res = await dispatchRegionalReport(reportId, action, payload);
      if (res.success) await loadAll();
      return { success: res.success };
    },
    [dispatchRegionalReport, loadAll]
  );

  const handleSendAnnouncementWrapper = useCallback(
    async (payload: {
      title: string;
      message: string;
      targetMode: 'all_districts' | 'selected_districts';
      targetDistricts?: string[];
      targetAudience: 'all' | 'district_coordinator' | 'school_admin' | 'ambassador' | 'student';
      priority?: 'normal' | 'urgent';
      pinToHome?: boolean;
      sendTelegram?: boolean;
      region?: string;
    }) => {
      const res = await sendRegionalAnnouncement({
        ...payload,
        region: payload.region || targetRegion,
      });
      if (res.success) await loadAll();
      return res;
    },
    [sendRegionalAnnouncement, targetRegion, loadAll]
  );

  const handleAwardWrapper = useCallback(
    async (payload: {
      region?: string;
      periodType: 'monthly' | 'yearly';
      category: 'district' | 'school' | 'student';
      targetId?: string;
      targetName: string;
      district?: string;
      rank: number;
      bonusCoins: number;
      prizeTitle: string;
    }) => {
      const res = await awardRegionalChampionship({
        ...payload,
        region: payload.region || targetRegion,
      });
      if (res.success) await loadAll();
      return res;
    },
    [awardRegionalChampionship, targetRegion, loadAll]
  );

  return (
    <div className="space-y-4">
      {/* Super Admin Region Filter & Section Switcher (only shown when Admin views regional_dashboard directly) */}
      {!onNavigateSection && (
        <div className="p-3 rounded-2xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 space-y-2.5">
          {isSuperAdminViewer && (
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200 dark:border-emerald-500/15">
              <span className="text-xs font-black text-emerald-500 uppercase tracking-wider">
                Regional Command Center (Super Admin Ko‘rinishi)
              </span>
              <select
                value={superAdminRegionFilter}
                onChange={e => setSuperAdminRegionFilter(e.target.value)}
                className="px-3 py-2 min-h-[40px] rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 text-xs font-bold outline-none"
              >
                {UZBEKISTAN_REGIONS.map(reg => (
                  <option key={reg} value={reg}>
                    {reg}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="flex flex-wrap gap-1.5">
            {REGIONAL_MENU_ITEMS.map(item => {
              const active = currentSection === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => navigate(item.id)}
                  className={`px-3 py-2 min-h-[40px] rounded-xl text-[11px] font-extrabold inline-flex items-center gap-1.5 transition-all cursor-pointer ${
                    active
                      ? 'bg-gradient-to-r from-[#00F5A0] to-[#10B981] text-[#04110B] border-b-[3px] border-emerald-700'
                      : 'bg-slate-50 dark:bg-[#040D0A] text-slate-600 dark:text-emerald-100/75 border border-slate-200 dark:border-emerald-500/15'
                  }`}
                >
                  <item.icon className="w-3.5 h-3.5 shrink-0" />
                  <span>{item.shortLabel}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {currentSection === 'regional_overview' && (
        <RegionalOverviewSection
          region={targetRegion}
          summary={summary}
          notifications={notifications}
          auditLogs={mergedAuditLogs}
          onNavigate={navigate}
          onMarkNotificationRead={markNotificationRead}
        />
      )}

      {currentSection === 'regional_coordinators' && (
        <RegionalCoordinatorsSection
          region={targetRegion}
          isSuperAdminViewer={isSuperAdminViewer}
          districts={summary?.districts || []}
          coordinators={coordinators}
          applications={incomingApplications}
          reports={regionalReports}
          globalSearchQuery={globalSearchQuery}
          onAppointCoordinator={handleAppointWrapper}
          onReviewApplication={handleReviewAppWrapper}
          onManageCoordinator={handleManageCoordWrapper}
          onNavigateSection={navigate}
          onInspectDistrictReports={handleInspectDistrictReports}
        />
      )}

      {currentSection === 'regional_map' && (
        <RegionalMapSection
          region={targetRegion}
          districts={summary?.districts || []}
          schools={regionalSchools}
          reports={regionalReports}
          onInspectDistrictReports={handleInspectDistrictReports}
          onInspectDistrictSchools={handleInspectDistrictSchools}
          onNavigateSection={navigate}
        />
      )}

      {currentSection === 'regional_schools_students' && (
        <RegionalSchoolsStudentsSection
          key={schoolsDistrictFilter}
          region={targetRegion}
          districts={summary?.districts || []}
          schools={regionalSchools}
          captains={captains}
          ambassadors={ambassadors}
          students={students}
          globalSearchQuery={globalSearchQuery}
          initialDistrictFilter={schoolsDistrictFilter}
          onRegisterSchool={handleRegisterSchoolWrapper}
          onUpdateSchool={handleUpdateSchoolWrapper}
        />
      )}

      {currentSection === 'regional_eco_control' && (
        <RegionalEcoControlSection
          key={ecoControlDistrictFilter}
          region={targetRegion}
          districts={summary?.districts || []}
          reports={regionalReports}
          globalSearchQuery={globalSearchQuery}
          initialDistrictFilter={ecoControlDistrictFilter}
          onDispatchReport={handleDispatchWrapper}
        />
      )}

      {currentSection === 'regional_championship' && (
        <RegionalChampionshipSection
          region={targetRegion}
          districts={summary?.districts || []}
          schools={regionalSchools}
          students={students}
          monthlyAwards={monthlyAwards}
          globalSearchQuery={globalSearchQuery}
          onAwardChampionship={handleAwardWrapper}
        />
      )}

      {currentSection === 'regional_announcements' && (
        <RegionalAnnouncementsSection
          region={targetRegion}
          districts={summary?.districts || []}
          announcements={announcements}
          notifications={notifications}
          onSendAnnouncement={handleSendAnnouncementWrapper}
          onMarkNotificationRead={markNotificationRead}
        />
      )}

      {currentSection === 'regional_analytics' && (
        <RegionalAnalyticsSection
          region={targetRegion}
          districts={summary?.districts || []}
          onFetchAnalytics={fetchRegionalAnalytics}
          apiFetch={apiFetch}
        />
      )}

      {currentSection === 'regional_ai_analyst' && (
        <RegionalAiAnalystSection
          region={targetRegion}
          summary={summary}
          onAskAiAnalyst={askRegionalAiAnalyst}
        />
      )}
    </div>
  );
};

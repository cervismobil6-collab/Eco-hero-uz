import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AnalyticsResponse,
  AuditLog,
  DistrictAnnouncementRecord,
  DistrictLeaderboardDetailsResponse,
  DistrictSectionId,
  DistrictUserGrowthResponse,
  RosterAmbassadorEntry,
  RosterCaptainEntry,
  RosterStudentEntry,
} from '../../types/eco';
import { useEco } from '../../context/EcoContext';
import { DISTRICT_MENU_ITEMS, slugifyChatKey } from './district/districtTypes';
import { DistrictOverviewSection } from './district/DistrictOverviewSection';
import { DistrictSchoolsSection } from './district/DistrictSchoolsSection';
import { DistrictStudentsSection } from './district/DistrictStudentsSection';
import { DistrictCaptainsSection } from './district/DistrictCaptainsSection';
import { DistrictApplicationsSection } from './district/DistrictApplicationsSection';
import { DistrictReportsSection } from './district/DistrictReportsSection';
import { DistrictAmbassadorsSection } from './district/DistrictAmbassadorsSection';
import { DistrictRatingsSection } from './district/DistrictRatingsSection';
import { DistrictRewardsSection } from './district/DistrictRewardsSection';
import { DistrictAnnouncementsSection } from './district/DistrictAnnouncementsSection';
import { DistrictAnalyticsSection } from './district/DistrictAnalyticsSection';
import { DistrictSettingsSection } from './district/DistrictSettingsSection';

interface DistrictCoordinatorDashboardViewProps {
  activeSection?: DistrictSectionId;
  onNavigateSection?: (section: DistrictSectionId) => void;
  globalSearchQuery?: string;
}

export const DistrictCoordinatorDashboardView: React.FC<DistrictCoordinatorDashboardViewProps> = ({
  activeSection,
  onNavigateSection,
  globalSearchQuery = '',
}) => {
  const {
    user,
    schools,
    ambassadors,
    reports,
    mediaSubmissions,
    registrationApplications,
    monthlyAwards,
    broadcasts,
    auditLogs,
    notifications,
    liveSyncVersion,
    fetchLeaderboard,
    fetchDistrictLeaderboardDetails,
    fetchDistrictUserGrowth,
    fetchRosterDirectory,
    fetchAnalytics,
    fetchDistrictAuditLogs,
    markNotificationRead,
    apiFetch,
  } = useEco();

  const [internalSection, setInternalSection] = useState<DistrictSectionId>('district_overview');
  const currentSection = activeSection || internalSection;

  const navigate = useCallback(
    (next: DistrictSectionId) => {
      if (onNavigateSection) onNavigateSection(next);
      else setInternalSection(next);
    },
    [onNavigateSection]
  );

  const [leaders, setLeaders] = useState<any[]>([]);
  const [lbForbidden, setLbForbidden] = useState(false);
  const [lbLoading, setLbLoading] = useState(false);

  const [districtDetails, setDistrictDetails] = useState<DistrictLeaderboardDetailsResponse | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);

  const [userGrowth, setUserGrowth] = useState<DistrictUserGrowthResponse | null>(null);
  const [userGrowthForbidden, setUserGrowthForbidden] = useState(false);

  const [districtCaptains, setDistrictCaptains] = useState<RosterCaptainEntry[]>([]);
  const [districtStudents, setDistrictStudents] = useState<RosterStudentEntry[]>([]);
  const [districtAmbassadorsRoster, setDistrictAmbassadorsRoster] = useState<RosterAmbassadorEntry[]>([]);

  const [analyticsData, setAnalyticsData] = useState<AnalyticsResponse | null>(null);
  const [districtAuditLogs, setDistrictAuditLogs] = useState<AuditLog[]>([]);
  const [districtAnnouncements, setDistrictAnnouncements] = useState<DistrictAnnouncementRecord[]>([]);
  const [selectedChatChannelId, setSelectedChatChannelId] = useState<string>('');

  const isSuperOrRegionalViewer = user.role === 'super_admin' || user.role === 'regional_coordinator';
  const targetRegion = user.region;
  const targetDistrict = user.district;

  const loadAll = useCallback(async () => {
    setLbLoading(true);
    setDetailsLoading(true);
    try {
      const [lbRes, detailsRes, growthRes, rosterRes, analyticsRes, logsRes, annRes] = await Promise.all([
        fetchLeaderboard('district_leaders', { period: 'monthly', limit: 20 }),
        fetchDistrictLeaderboardDetails({ region: targetRegion, district: targetDistrict }),
        fetchDistrictUserGrowth(),
        fetchRosterDirectory({ region: targetRegion, district: targetDistrict }),
        fetchAnalytics({ region: targetRegion, district: targetDistrict }),
        fetchDistrictAuditLogs(),
        apiFetch('/api/district/announcements')
          .then(r => r.json())
          .catch(() => null),
      ]);

      if (lbRes.forbidden) setLbForbidden(true);
      else {
        setLbForbidden(false);
        setLeaders(lbRes.items || []);
      }

      if (detailsRes) setDistrictDetails(detailsRes);

      if (growthRes.forbidden) setUserGrowthForbidden(true);
      else if (growthRes.success && growthRes.data) {
        setUserGrowthForbidden(false);
        setUserGrowth(growthRes.data);
      }

      if (rosterRes) {
        setDistrictCaptains(rosterRes.districtCaptains || []);
        setDistrictStudents(rosterRes.districtStudents || []);
        setDistrictAmbassadorsRoster(rosterRes.districtAmbassadors || []);
      }

      if (analyticsRes) setAnalyticsData(analyticsRes);
      if (logsRes) setDistrictAuditLogs(logsRes);
      if (annRes?.success && Array.isArray(annRes.announcements)) {
        setDistrictAnnouncements(annRes.announcements);
      }
    } finally {
      setLbLoading(false);
      setDetailsLoading(false);
    }
  }, [
    fetchLeaderboard,
    fetchDistrictLeaderboardDetails,
    fetchDistrictUserGrowth,
    fetchRosterDirectory,
    fetchAnalytics,
    fetchDistrictAuditLogs,
    apiFetch,
    targetRegion,
    targetDistrict,
  ]);

  useEffect(() => {
    loadAll();
  }, [loadAll, liveSyncVersion]);

  const districtSchools = useMemo(() => {
    const list =
      user.role === 'super_admin'
        ? schools
        : schools.filter(
            s =>
              s.district?.toLowerCase() === (targetDistrict || '').toLowerCase() &&
              s.region?.toLowerCase() === (targetRegion || '').toLowerCase()
          );
    return [...list].sort((a, b) => (b.totalCoins || 0) - (a.totalCoins || 0));
  }, [schools, user.role, targetDistrict, targetRegion]);

  const districtReports = useMemo(
    () =>
      user.role === 'super_admin'
        ? reports
        : reports.filter(
            r =>
              r.district?.toLowerCase() === (targetDistrict || '').toLowerCase() &&
              r.region?.toLowerCase() === (targetRegion || '').toLowerCase()
          ),
    [reports, user.role, targetDistrict, targetRegion]
  );

  const districtMedia = useMemo(
    () =>
      user.role === 'super_admin'
        ? mediaSubmissions
        : mediaSubmissions.filter(
            m =>
              m.district?.toLowerCase() === (targetDistrict || '').toLowerCase() &&
              m.region?.toLowerCase() === (targetRegion || '').toLowerCase()
          ),
    [mediaSubmissions, user.role, targetDistrict, targetRegion]
  );

  const districtApplications = useMemo(
    () =>
      registrationApplications.filter(
        a =>
          ['school_admin', 'ambassador'].includes(a.requestedRole) &&
          (user.role === 'super_admin' ||
            (a.district?.toLowerCase() === (targetDistrict || '').toLowerCase() &&
              a.region?.toLowerCase() === (targetRegion || '').toLowerCase()))
      ),
    [registrationApplications, user.role, targetDistrict, targetRegion]
  );

  const fallbackAmbassadors: RosterAmbassadorEntry[] = useMemo(() => {
    if (districtAmbassadorsRoster.length > 0) return districtAmbassadorsRoster;
    return ambassadors
      .filter(
        a =>
          user.role === 'super_admin' ||
          districtSchools.some(s => s.id === a.schoolId) ||
          a.district?.toLowerCase() === (targetDistrict || '').toLowerCase()
      )
      .map(a => ({
        id: a.id,
        uid: a.id,
        fullName: a.fullName,
        schoolId: a.schoolId,
        schoolName: a.schoolName,
        region: a.region || targetRegion,
        district: a.district || targetDistrict,
        grade: a.grade,
        phone: a.phone,
        telegramUsername: a.telegramUsername,
        ecoCoins: Number(a.ecoCoins || 0),
        verifiedActivitiesCount: Number(a.verifiedActivitiesCount || 0),
        tasksCompletedCount: Number(a.tasksCompletedCount || 0),
        status: a.status,
        appointedAt: a.appointedAt,
      }));
  }, [districtAmbassadorsRoster, ambassadors, districtSchools, user.role, targetDistrict, targetRegion]);

  const districtAwardHistory = useMemo(
    () =>
      (districtDetails?.monthlyAwards?.length ? districtDetails.monthlyAwards : monthlyAwards).filter(
        aw =>
          user.role === 'super_admin' ||
          (aw.district?.toLowerCase() === (targetDistrict || '').toLowerCase() &&
            aw.region?.toLowerCase() === (targetRegion || '').toLowerCase())
      ),
    [districtDetails, monthlyAwards, user.role, targetDistrict, targetRegion]
  );

  const mergedAnnouncements = useMemo(() => {
    if (districtAnnouncements.length > 0) return districtAnnouncements;
    return broadcasts
      .filter(b => (b as any).scope === 'district')
      .map(b => b as unknown as DistrictAnnouncementRecord);
  }, [districtAnnouncements, broadcasts]);

  const mergedAuditLogs = useMemo(
    () => (districtAuditLogs.length > 0 ? districtAuditLogs : auditLogs),
    [districtAuditLogs, auditLogs]
  );

  const totalStudents = useMemo(() => {
    const bySchools = districtSchools.reduce((sum, s) => sum + (s.registeredStudentsCount || s.studentsCount || 0), 0);
    return Math.max(bySchools, districtStudents.length);
  }, [districtSchools, districtStudents.length]);

  const handleOpenCaptainChat = (captainUid?: string, districtName?: string) => {
    const distSlug = slugifyChatKey(districtName || targetDistrict || 'shayxontohur_tumani');
    const ch = captainUid ? `dist_dm:${distSlug}:${captainUid}` : `dist_group:${distSlug}`;
    setSelectedChatChannelId(ch);
    navigate('district_announcements');
  };

  return (
    <div className="space-y-4">
      {/* Compact fallback section switcher only when viewed by Super Admin / Regional Coordinator inside 'district_dashboard' */}
      {isSuperOrRegionalViewer && !onNavigateSection && (
        <div className="p-2 rounded-2xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 flex items-center gap-1.5 overflow-x-auto scrollbar-hide">
          {DISTRICT_MENU_ITEMS.map(item => (
            <button
              key={item.id}
              type="button"
              onClick={() => navigate(item.id)}
              className={`px-3 py-2 min-h-[38px] rounded-xl text-[11px] font-black whitespace-nowrap flex items-center gap-1.5 cursor-pointer transition-all ${
                currentSection === item.id
                  ? 'bg-gradient-to-r from-[#00F5A0] to-[#10B981] text-[#04110B]'
                  : 'text-slate-500 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-emerald-500/10'
              }`}
            >
              <item.icon className="w-3.5 h-3.5 shrink-0" />
              <span>{item.shortLabel}</span>
            </button>
          ))}
        </div>
      )}

      {currentSection === 'district_overview' && (
        <DistrictOverviewSection
          region={targetRegion}
          district={targetDistrict}
          schools={districtSchools}
          totalStudents={totalStudents}
          captains={districtCaptains}
          ambassadorsCount={fallbackAmbassadors.filter(a => a.status === 'active').length}
          applications={districtApplications}
          reports={districtReports}
          mediaSubmissions={districtMedia}
          notifications={notifications}
          auditLogs={mergedAuditLogs}
          districtDetails={districtDetails}
          userGrowth={userGrowth}
          onNavigate={navigate}
          onMarkNotificationRead={markNotificationRead}
        />
      )}

      {currentSection === 'district_schools' && (
        <DistrictSchoolsSection
          region={targetRegion}
          district={targetDistrict}
          schools={districtSchools}
          captains={districtCaptains}
          ambassadors={fallbackAmbassadors}
          reports={districtReports}
          globalSearchQuery={globalSearchQuery}
          onRefresh={loadAll}
        />
      )}

      {currentSection === 'district_students' && (
        <DistrictStudentsSection
          students={districtStudents}
          schools={districtSchools}
          globalSearchQuery={globalSearchQuery}
          onRefresh={loadAll}
        />
      )}

      {currentSection === 'district_captains' && (
        <DistrictCaptainsSection
          region={targetRegion}
          district={targetDistrict}
          schools={districtSchools}
          captains={districtCaptains}
          globalSearchQuery={globalSearchQuery}
          onOpenCaptainChat={handleOpenCaptainChat}
          onRefresh={loadAll}
        />
      )}

      {currentSection === 'district_applications' && (
        <DistrictApplicationsSection
          applications={districtApplications}
          globalSearchQuery={globalSearchQuery}
          onRefresh={loadAll}
        />
      )}

      {currentSection === 'district_reports' && (
        <DistrictReportsSection
          reports={districtReports}
          mediaSubmissions={districtMedia}
          schools={districtSchools}
          globalSearchQuery={globalSearchQuery}
          onRefresh={loadAll}
        />
      )}

      {currentSection === 'district_ambassadors' && (
        <DistrictAmbassadorsSection
          schools={districtSchools}
          ambassadors={fallbackAmbassadors}
          ambassadorRatings={districtDetails?.ambassadorRatings || []}
          globalSearchQuery={globalSearchQuery}
          onRefresh={loadAll}
        />
      )}

      {currentSection === 'district_ratings' && (
        <DistrictRatingsSection
          region={targetRegion}
          district={targetDistrict}
          districtDetails={districtDetails}
          detailsLoading={detailsLoading}
          userGrowth={userGrowth}
          userGrowthForbidden={userGrowthForbidden}
          leaders={leaders}
          lbLoading={lbLoading}
          lbForbidden={lbForbidden}
        />
      )}

      {currentSection === 'district_rewards' && (
        <DistrictRewardsSection
          region={targetRegion}
          district={targetDistrict}
          districtDetails={districtDetails}
          awardHistory={districtAwardHistory}
          onRefresh={loadAll}
        />
      )}

      {currentSection === 'district_announcements' && (
        <DistrictAnnouncementsSection
          district={targetDistrict}
          schools={districtSchools}
          announcements={mergedAnnouncements}
          notifications={notifications}
          initialChatChannelId={selectedChatChannelId}
          onRefresh={loadAll}
        />
      )}

      {currentSection === 'district_analytics' && (
        <DistrictAnalyticsSection
          region={targetRegion}
          district={targetDistrict}
          analytics={analyticsData}
          schools={districtSchools}
        />
      )}

      {currentSection === 'district_settings' && (
        <DistrictSettingsSection auditLogs={mergedAuditLogs} onNavigate={navigate} />
      )}
    </div>
  );
};

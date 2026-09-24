import React, { useState, useEffect } from 'react';
import {
  Smartphone,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  ExternalLink,
  Lock,
  Sparkles,
  DownloadCloud,
  AlertCircle,
  Check,
  Globe,
  Sliders,
  ShieldAlert
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { SystemSettings as SystemSettingsType } from '../../types';
import { getSystemSettingsFromSupabase } from '../../services/supabaseService';
import { isValidSemVer, compareSemVer } from '../../utils/versionUtils';

interface AppVersionCardProps {
  settings: SystemSettingsType;
  onUpdateSettings: (updated: SystemSettingsType) => Promise<void> | void;
}

export const AppVersionCard: React.FC<AppVersionCardProps> = ({
  settings,
  onUpdateSettings,
}) => {
  const { isAdminOrHigher, currentUser } = useAuth();
  const isStaff = !isAdminOrHigher;

  // Local form state
  const [latestVersion, setLatestVersion] = useState(
    settings.latestAppVersion || settings.appVersion || '1.0.8'
  );
  const [minimumVersion, setMinimumVersion] = useState(
    settings.minimumAppVersion || settings.minAppVersion || '1.0.7'
  );
  const [updateMessage, setUpdateMessage] = useState(
    settings.updateMessage || ''
  );
  const [updateUrl, setUpdateUrl] = useState(
    settings.updateUrl || ''
  );
  const [isForceUpdate, setIsForceUpdate] = useState(
    Boolean(settings.isForceUpdate)
  );

  // Status & feedback state
  const [isSaving, setIsSaving] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
    details?: string;
  } | null>(null);
  const [validationErrors, setValidationErrors] = useState<{
    latest?: string;
    minimum?: string;
    order?: string;
    url?: string;
  }>({});

  // Sync with incoming settings prop
  useEffect(() => {
    setLatestVersion(settings.latestAppVersion || settings.appVersion || '1.0.8');
    setMinimumVersion(settings.minimumAppVersion || settings.minAppVersion || '1.0.7');
    setUpdateMessage(settings.updateMessage || '');
    setUpdateUrl(settings.updateUrl || '');
    setIsForceUpdate(Boolean(settings.isForceUpdate));
  }, [
    settings.latestAppVersion,
    settings.appVersion,
    settings.minimumAppVersion,
    settings.minAppVersion,
    settings.updateMessage,
    settings.updateUrl,
    settings.isForceUpdate,
  ]);

  // Live validation
  const validateForm = (): boolean => {
    const errors: {
      latest?: string;
      minimum?: string;
      order?: string;
      url?: string;
    } = {};

    const cleanLatest = latestVersion.trim();
    const cleanMin = minimumVersion.trim();

    if (!cleanLatest) {
      errors.latest = 'Latest app version is required.';
    } else if (!isValidSemVer(cleanLatest)) {
      errors.latest = 'Must be valid semantic version (e.g. 1.0.0).';
    }

    if (!cleanMin) {
      errors.minimum = 'Minimum supported version is required.';
    } else if (!isValidSemVer(cleanMin)) {
      errors.minimum = 'Must be valid semantic version (e.g. 1.0.0).';
    }

    if (
      !errors.latest &&
      !errors.minimum &&
      compareSemVer(cleanMin, cleanLatest) > 0
    ) {
      errors.order = `Minimum version (${cleanMin}) cannot be higher than Latest version (${cleanLatest}).`;
    }

    if (updateUrl.trim()) {
      try {
        const parsed = new URL(updateUrl.trim());
        if (!['http:', 'https:'].includes(parsed.protocol)) {
          errors.url = 'Update URL must begin with http:// or https://';
        }
      } catch {
        errors.url = 'Enter a valid web or APK download URL.';
      }
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Manual refresh directly from Supabase app_config (id='general')
  const handleRefreshFromRemote = async () => {
    setIsRefreshing(true);
    setFeedback(null);
    try {
      const fresh = await getSystemSettingsFromSupabase();
      if (fresh) {
        setLatestVersion(fresh.latestAppVersion || fresh.appVersion || '1.0.8');
        setMinimumVersion(fresh.minimumAppVersion || fresh.minAppVersion || '1.0.7');
        setUpdateMessage(fresh.updateMessage || '');
        setUpdateUrl(fresh.updateUrl || '');
        setIsForceUpdate(Boolean(fresh.isForceUpdate));

        setFeedback({
          type: 'success',
          message: 'Refreshed from Supabase app_config (id=general)',
          details: `Latest: v${fresh.latestAppVersion || '1.0.8'} • Minimum: v${fresh.minimumAppVersion || '1.0.7'}`,
        });
      } else {
        setFeedback({
          type: 'error',
          message: 'Could not fetch remote configuration row.',
        });
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: 'Failed to refresh remote settings',
        details: err?.message || String(err),
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  // Handle Save
  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    if (isStaff) {
      setFeedback({
        type: 'error',
        message: 'Access Denied',
        details: 'Staff accounts are restricted from modifying remote app version controls.',
      });
      return;
    }

    if (!validateForm()) {
      setFeedback({
        type: 'error',
        message: 'Validation Error',
        details: 'Please correct the invalid version fields before saving.',
      });
      return;
    }

    setIsSaving(true);
    setFeedback(null);

    const cleanLatest = latestVersion.trim().replace(/^v/i, '');
    const cleanMin = minimumVersion.trim().replace(/^v/i, '');
    const cleanMsg = updateMessage.trim();
    const cleanUrl = updateUrl.trim();

    const updatedSettings: SystemSettingsType = {
      ...settings,
      latestAppVersion: cleanLatest,
      appVersion: cleanLatest,
      minimumAppVersion: cleanMin,
      minAppVersion: cleanMin,
      updateMessage: cleanMsg,
      updateUrl: cleanUrl,
      isForceUpdate: isForceUpdate,
    };

    try {
      await onUpdateSettings(updatedSettings);

      setFeedback({
        type: 'success',
        message: 'App Version & Remote Update Settings Published!',
        details: `v${cleanLatest} (Min: v${cleanMin}) is now live in Supabase and active for the Android User App.`,
      });

      // Clear inline errors
      setValidationErrors({});
    } catch (err: any) {
      console.error('[AppVersionCard] Save error:', err);
      setFeedback({
        type: 'error',
        message: 'Failed to save version settings',
        details: err?.message || 'Database write error. Check your connection.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Pre-fill standard release template
  const handleApplyPreset = (preset: 'major' | 'minor' | 'patch') => {
    if (isStaff) return;
    const parts = (latestVersion || '1.0.0').trim().replace(/^v/i, '').split('.').map(Number);
    let [maj = 1, min = 0, pat = 0] = parts;

    if (preset === 'major') {
      maj += 1;
      min = 0;
      pat = 0;
    } else if (preset === 'minor') {
      min += 1;
      pat = 0;
    } else {
      pat += 1;
    }

    const nextVer = `${maj}.${min}.${pat}`;
    setLatestVersion(nextVer);
    // Suggest updating update message
    if (!updateMessage) {
      setUpdateMessage(`WinX7 v${nextVer} is now live with enhanced anti-cheat security, faster matchmaking, and bug fixes.`);
    }
  };

  return (
    <div
      id="app-version-control-card"
      className="bg-[#141215] border border-[#29252A] rounded-2xl p-5 sm:p-7 shadow-2xl relative overflow-hidden transition-all duration-200"
    >
      {/* Background Ambience Glow */}
      <div className="absolute top-0 right-0 w-80 h-80 bg-[#C9A34E]/5 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />

      {/* Staff Restriction Overlay Banner */}
      {isStaff && (
        <div className="mb-6 p-4 rounded-xl bg-[#350A12]/80 border border-[#E21B36]/40 flex items-start gap-3">
          <Lock className="w-5 h-5 text-[#E21B36] shrink-0 mt-0.5" />
          <div>
            <h4 className="text-xs font-black uppercase tracking-wider text-[#F5F5F5]">
              Staff Role • Read-Only Access
            </h4>
            <p className="text-[11px] text-[#B0ACB0] mt-0.5">
              Staff accounts are restricted to match coordination and results. Only Admin or Superadmin can modify Android remote app version thresholds.
            </p>
          </div>
        </div>
      )}

      {/* Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-[#29252A]">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-[#1B181C] border border-[#C9A34E]/30 flex items-center justify-center text-[#C9A34E] shadow-lg shrink-0">
            <Smartphone className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base sm:text-lg font-black text-[#F5F5F5] uppercase tracking-wide">
                App Version & Remote Updates
              </h2>
              <span className="px-2 py-0.5 text-[10px] font-black uppercase tracking-wider bg-[#1B181C] text-[#C9A34E] rounded-md border border-[#C9A34E]/30">
                Android OTA Config
              </span>
              <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-[#1B181C] text-[#777278] rounded-md border border-[#29252A]">
                app_config (general)
              </span>
            </div>
            <p className="text-xs text-[#B0ACB0] mt-0.5">
              Configure current releases, minimum version cutoffs, force updates, and APK distribution links.
            </p>
          </div>
        </div>

        {/* Remote Sync Button */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            id="btn-refresh-version-remote"
            type="button"
            onClick={handleRefreshFromRemote}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#1B181C] border border-[#29252A] text-[#B0ACB0] hover:text-[#C9A34E] hover:border-[#C9A34E]/40 text-xs font-bold transition disabled:opacity-50"
            title="Reload current settings directly from Supabase"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-[#C9A34E]' : ''}`} />
            <span>{isRefreshing ? 'Checking...' : 'Refresh Supabase'}</span>
          </button>
        </div>
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div
          id="version-feedback-alert"
          className={`mt-5 p-3.5 rounded-xl border flex items-start gap-2.5 text-xs animate-in fade-in duration-150 ${
            feedback.type === 'success'
              ? 'bg-[#172617] border-[#22c55e]/40 text-[#86efac]'
              : 'bg-[#350A12] border-[#E21B36]/50 text-[#fca5a5]'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-[#22c55e]" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-[#E21B36]" />
          )}
          <div className="flex-1">
            <span className="font-bold">{feedback.message}</span>
            {feedback.details && (
              <p className="text-[11px] opacity-90 mt-0.5">{feedback.details}</p>
            )}
          </div>
        </div>
      )}

      {/* Main Form Body */}
      <form onSubmit={handleSave} className="mt-6 space-y-6">
        {/* Version Inputs Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Latest App Version */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label
                htmlFor="input-latest-app-version"
                className="text-[11px] font-black uppercase tracking-wider text-[#B0ACB0] flex items-center gap-1.5"
              >
                <span>Latest Public Version</span>
                <span className="text-[#E21B36]">*</span>
              </label>
              {/* Preset Increments */}
              {!isStaff && (
                <div className="flex items-center gap-1 text-[10px]">
                  <span className="text-[#777278] mr-1">Bump:</span>
                  <button
                    type="button"
                    onClick={() => handleApplyPreset('patch')}
                    className="px-1.5 py-0.5 rounded bg-[#1B181C] hover:bg-[#29252A] text-[#C9A34E] font-mono border border-[#29252A]"
                    title="Increment patch version (+0.0.1)"
                  >
                    +Patch
                  </button>
                  <button
                    type="button"
                    onClick={() => handleApplyPreset('minor')}
                    className="px-1.5 py-0.5 rounded bg-[#1B181C] hover:bg-[#29252A] text-[#C9A34E] font-mono border border-[#29252A]"
                    title="Increment minor version (+0.1.0)"
                  >
                    +Minor
                  </button>
                </div>
              )}
            </div>

            <div className="relative">
              <input
                id="input-latest-app-version"
                type="text"
                disabled={isStaff}
                value={latestVersion}
                onChange={(e) => {
                  setLatestVersion(e.target.value);
                  if (validationErrors.latest || validationErrors.order) {
                    setValidationErrors((prev) => ({
                      ...prev,
                      latest: undefined,
                      order: undefined,
                    }));
                  }
                }}
                placeholder="e.g. 1.0.8"
                className={`w-full bg-[#171418] text-[#F5F5F5] font-mono text-sm p-3 pr-24 rounded-xl border transition placeholder-[#777278] focus:outline-none ${
                  validationErrors.latest
                    ? 'border-[#E21B36] focus:border-[#E21B36]'
                    : 'border-[#29252A] focus:border-[#C9A34E]'
                } ${isStaff ? 'opacity-60 cursor-not-allowed' : ''}`}
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                {isValidSemVer(latestVersion) ? (
                  <span className="px-2 py-0.5 text-[10px] font-black uppercase bg-[#1B181C] text-[#C9A34E] border border-[#C9A34E]/30 rounded">
                    v{latestVersion.trim().replace(/^v/i, '')}
                  </span>
                ) : (
                  <span className="text-[10px] text-[#E21B36] font-bold">Invalid</span>
                )}
              </div>
            </div>

            {validationErrors.latest ? (
              <p className="text-[11px] text-[#E21B36] flex items-center gap-1 font-medium">
                <AlertCircle className="w-3 h-3 shrink-0" />
                {validationErrors.latest}
              </p>
            ) : (
              <p className="text-[11px] text-[#777278]">
                Highest available APK version released to players (maps to <code className="text-[#C9A34E]">latest_app_version</code>).
              </p>
            )}
          </div>

          {/* Minimum Supported Version */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label
                htmlFor="input-minimum-app-version"
                className="text-[11px] font-black uppercase tracking-wider text-[#B0ACB0] flex items-center gap-1.5"
              >
                <span>Minimum Supported Version</span>
                <span className="text-[#E21B36]">*</span>
              </label>
              <span className="text-[10px] font-semibold text-[#777278]">
                Blocking Cutoff
              </span>
            </div>

            <div className="relative">
              <input
                id="input-minimum-app-version"
                type="text"
                disabled={isStaff}
                value={minimumVersion}
                onChange={(e) => {
                  setMinimumVersion(e.target.value);
                  if (validationErrors.minimum || validationErrors.order) {
                    setValidationErrors((prev) => ({
                      ...prev,
                      minimum: undefined,
                      order: undefined,
                    }));
                  }
                }}
                placeholder="e.g. 1.0.7"
                className={`w-full bg-[#171418] text-[#F5F5F5] font-mono text-sm p-3 pr-24 rounded-xl border transition placeholder-[#777278] focus:outline-none ${
                  validationErrors.minimum || validationErrors.order
                    ? 'border-[#E21B36] focus:border-[#E21B36]'
                    : 'border-[#29252A] focus:border-[#C9A34E]'
                } ${isStaff ? 'opacity-60 cursor-not-allowed' : ''}`}
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                {isValidSemVer(minimumVersion) ? (
                  <span className="px-2 py-0.5 text-[10px] font-black uppercase bg-[#1B181C] text-[#C9A34E] border border-[#C9A34E]/30 rounded">
                    v{minimumVersion.trim().replace(/^v/i, '')}
                  </span>
                ) : (
                  <span className="text-[10px] text-[#E21B36] font-bold">Invalid</span>
                )}
              </div>
            </div>

            {validationErrors.minimum ? (
              <p className="text-[11px] text-[#E21B36] flex items-center gap-1 font-medium">
                <AlertCircle className="w-3 h-3 shrink-0" />
                {validationErrors.minimum}
              </p>
            ) : validationErrors.order ? (
              <p className="text-[11px] text-[#E21B36] flex items-center gap-1 font-medium">
                <AlertCircle className="w-3 h-3 shrink-0" />
                {validationErrors.order}
              </p>
            ) : (
              <p className="text-[11px] text-[#777278]">
                Older builds below this threshold are blocked from logging in or joining matches (<code className="text-[#C9A34E]">minimum_app_version</code> / <code className="text-[#C9A34E]">min_app_version</code>).
              </p>
            )}
          </div>
        </div>

        {/* Update URL */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label
              htmlFor="input-update-url"
              className="text-[11px] font-black uppercase tracking-wider text-[#B0ACB0] flex items-center gap-1.5"
            >
              <DownloadCloud className="w-3.5 h-3.5 text-[#C9A34E]" />
              <span>Update Download / APK / Store URL</span>
            </label>
            {updateUrl.trim() && (
              <a
                href={updateUrl.trim()}
                target="_blank"
                rel="noreferrer noopener"
                className="text-[11px] text-[#C9A34E] hover:underline flex items-center gap-1 font-bold"
              >
                <span>Test Link</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>

          <div className="relative">
            <input
              id="input-update-url"
              type="url"
              disabled={isStaff}
              value={updateUrl}
              onChange={(e) => {
                setUpdateUrl(e.target.value);
                if (validationErrors.url) {
                  setValidationErrors((prev) => ({ ...prev, url: undefined }));
                }
              }}
              placeholder="https://winx7.com/download or https://drive.google.com/..."
              className={`w-full bg-[#171418] text-[#F5F5F5] text-xs p-3 rounded-xl border transition placeholder-[#777278] focus:outline-none ${
                validationErrors.url
                  ? 'border-[#E21B36] focus:border-[#E21B36]'
                  : 'border-[#29252A] focus:border-[#C9A34E]'
              } ${isStaff ? 'opacity-60 cursor-not-allowed' : ''}`}
            />
          </div>

          {validationErrors.url ? (
            <p className="text-[11px] text-[#E21B36] flex items-center gap-1 font-medium">
              <AlertCircle className="w-3 h-3 shrink-0" />
              {validationErrors.url}
            </p>
          ) : (
            <p className="text-[11px] text-[#777278]">
              Where players are redirected when tapping &quot;Update Now&quot; in the Android User App (<code className="text-[#C9A34E]">update_url</code>).
            </p>
          )}
        </div>

        {/* Update Message */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label
              htmlFor="input-update-message"
              className="text-[11px] font-black uppercase tracking-wider text-[#B0ACB0]"
            >
              Update Announcement Message
            </label>
            <span className="text-[10px] text-[#777278]">
              {updateMessage.length} characters
            </span>
          </div>

          <textarea
            id="input-update-message"
            disabled={isStaff}
            rows={3}
            value={updateMessage}
            onChange={(e) => setUpdateMessage(e.target.value)}
            placeholder="A new version of WinX7 is available! Update now for anti-cheat improvements, faster matchmaking, and tournament room auto-sync."
            className={`w-full bg-[#171418] text-[#F5F5F5] text-xs p-3 rounded-xl border border-[#29252A] placeholder-[#777278] focus:outline-none focus:border-[#C9A34E] resize-y transition ${
              isStaff ? 'opacity-60 cursor-not-allowed' : ''
            }`}
          />
          <p className="text-[11px] text-[#777278]">
            Displayed directly on the in-app update popup dialog inside the Android User App (<code className="text-[#C9A34E]">update_message</code>).
          </p>
        </div>

        {/* Force Update Toggle */}
        <div
          id="force-update-toggle-container"
          className={`p-4 rounded-xl border transition ${
            isForceUpdate
              ? 'bg-[#29080F] border-[#E21B36]/50'
              : 'bg-[#171418] border-[#29252A]'
          }`}
        >
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div
                className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border transition ${
                  isForceUpdate
                    ? 'bg-[#350A12] border-[#E21B36]/40 text-[#E21B36]'
                    : 'bg-[#1B181C] border-[#29252A] text-[#777278]'
                }`}
              >
                {isForceUpdate ? (
                  <ShieldAlert className="w-5 h-5 animate-pulse" />
                ) : (
                  <Sliders className="w-5 h-5" />
                )}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-black uppercase tracking-wide text-[#F5F5F5]">
                    Force Update Mode (<code className="text-[#C9A34E]">is_force_update</code>)
                  </h3>
                  <span
                    className={`px-2 py-0.5 text-[9px] font-black uppercase rounded ${
                      isForceUpdate
                        ? 'bg-[#E21B36] text-white shadow-md shadow-[#E21B36]/30'
                        : 'bg-[#1B181C] text-[#777278] border border-[#29252A]'
                    }`}
                  >
                    {isForceUpdate ? 'MANDATORY' : 'OPTIONAL'}
                  </span>
                </div>
                <p className="text-[11px] text-[#B0ACB0] mt-0.5">
                  {isForceUpdate
                    ? 'Non-dismissible dialog: Users on outdated builds are locked out until they update.'
                    : 'Dismissible prompt: Users receive an update notification banner but can postpone updating.'}
                </p>
              </div>
            </div>

            {/* Custom Styled Switch */}
            <button
              id="btn-toggle-force-update"
              type="button"
              disabled={isStaff}
              onClick={() => setIsForceUpdate((prev) => !prev)}
              aria-label="Toggle Force Update"
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                isForceUpdate ? 'bg-[#E21B36]' : 'bg-[#29252A]'
              } ${isStaff ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                  isForceUpdate ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Live Simulator Preview */}
        <div className="p-4 rounded-xl bg-[#171418] border border-[#29252A]/80">
          <div className="flex items-center justify-between pb-3 border-b border-[#29252A] mb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#C9A34E]" />
              <h4 className="text-xs font-black uppercase tracking-wider text-[#F5F5F5]">
                Android User App Dialog Preview
              </h4>
            </div>
            <span className="text-[10px] text-[#777278]">
              Simulated Client View
            </span>
          </div>

          {/* Android Dialog Mockup Card */}
          <div className="max-w-md mx-auto p-4 rounded-2xl bg-[#0D0B0D] border border-[#C9A34E]/30 shadow-2xl relative">
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#C9A34E] animate-ping" />
                <span className="text-[11px] font-black uppercase tracking-widest text-[#C9A34E]">
                  WINX7 ESPORTS
                </span>
              </div>
              <span className="px-2 py-0.5 text-[9px] font-bold uppercase bg-[#1B181C] text-[#F5F5F5] rounded border border-[#29252A]">
                v{latestVersion.trim().replace(/^v/i, '') || '1.0.8'}
              </span>
            </div>

            <h5 className="text-sm font-black text-[#F5F5F5] uppercase tracking-wide">
              {isForceUpdate ? 'CRITICAL UPDATE REQUIRED' : 'NEW UPDATE AVAILABLE'}
            </h5>

            <p className="text-xs text-[#B0ACB0] mt-1.5 leading-relaxed bg-[#141215] p-2.5 rounded-lg border border-[#29252A]">
              {updateMessage.trim() ||
                'A new version of WinX7 is available. Please update now to access live tournaments, room credentials, and anti-cheat updates.'}
            </p>

            <div className="mt-3 flex items-center justify-between text-[10px] text-[#777278] px-1">
              <span>Minimum Required: v{minimumVersion.trim().replace(/^v/i, '') || '1.0.7'}</span>
              <span>{isForceUpdate ? 'Locked • Non-Dismissible' : 'Dismissible'}</span>
            </div>

            <div className="mt-4 flex gap-2">
              {!isForceUpdate && (
                <button
                  type="button"
                  disabled
                  className="flex-1 py-2 rounded-xl bg-[#1B181C] text-[#777278] text-xs font-bold border border-[#29252A] opacity-70"
                >
                  Later
                </button>
              )}
              <button
                type="button"
                disabled
                className="flex-1 py-2 rounded-xl bg-gradient-to-r from-[#E21B36] to-[#B51429] text-white text-xs font-black uppercase tracking-wider shadow-md shadow-[#E21B36]/20 flex items-center justify-center gap-1.5"
              >
                <span>Update Now</span>
                <ExternalLink className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="text-[11px] text-[#777278]">
            Changes are saved directly into <code className="text-[#C9A34E]">public.app_config (id=&apos;general&apos;)</code>.
          </div>

          <div className="flex items-center gap-3">
            <button
              id="btn-reset-version-form"
              type="button"
              disabled={isSaving || isStaff}
              onClick={() => {
                setLatestVersion(settings.latestAppVersion || settings.appVersion || '1.0.8');
                setMinimumVersion(settings.minimumAppVersion || settings.minAppVersion || '1.0.7');
                setUpdateMessage(settings.updateMessage || '');
                setUpdateUrl(settings.updateUrl || '');
                setIsForceUpdate(Boolean(settings.isForceUpdate));
                setValidationErrors({});
                setFeedback(null);
              }}
              className="px-4 py-2.5 rounded-xl bg-[#1B181C] border border-[#29252A] text-[#B0ACB0] hover:text-[#F5F5F5] hover:bg-[#29252A] text-xs font-black uppercase tracking-wider transition disabled:opacity-50"
            >
              Reset
            </button>

            <button
              id="btn-save-version-settings"
              type="submit"
              disabled={isSaving || isStaff}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-[#E21B36] via-[#C9182D] to-[#990F21] hover:from-[#F02240] hover:to-[#B51429] text-white text-xs font-black uppercase tracking-wider shadow-lg shadow-[#E21B36]/25 active:scale-95 transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {isSaving ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Publishing...</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>Save & Publish Version</span>
                </>
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};

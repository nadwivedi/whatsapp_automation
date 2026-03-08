import { useState } from "react";
import AuthPage from "./components/AuthPage";
import AppShell from "./components/AppShell";
import { usePathRoute } from "./hooks/usePathRoute";
import { useWhatsAppManager } from "./hooks/useWhatsAppManager";
import { getRouteKey } from "./router/routes";
import DashboardPage from "./pages/DashboardPage";
import SessionsPage from "./pages/SessionsPage";
import TemplatesPage from "./pages/TemplatesPage";
import BusinessCategoriesPage from "./pages/BusinessCategoriesPage";
import BusinessesPage from "./pages/BusinessesPage";
import CampaignsPage from "./pages/CampaignsPage";
import MessagesPage from "./pages/MessagesPage";
import SettingsPage from "./pages/SettingsPage";

function App() {
  const app = useWhatsAppManager();
  const { pathname, navigate } = usePathRoute();
  const activeRoute = getRouteKey(pathname);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  if (!app.token) {
    return (
      <AuthPage
        authMode={app.authMode}
        authBusy={app.authBusy}
        authForm={app.authForm}
        setAuthMode={app.setAuthMode}
        setAuthForm={app.setAuthForm}
        submitAuth={app.submitAuth}
        notice={app.notice}
      />
    );
  }

  function renderPage() {
    if (activeRoute === "sessions") {
      return (
        <SessionsPage
          refreshing={app.refreshing}
          refreshAll={app.refreshAll}
          accountForm={app.accountForm}
          setAccountForm={app.setAccountForm}
          createAccount={app.createAccount}
          busy={app.busy}
          accounts={app.accounts}
          accountAction={app.accountAction}
          showQr={app.showQr}
          removeAccount={app.removeAccount}
          dailyDrafts={app.dailyDrafts}
          setDailyDrafts={app.setDailyDrafts}
          updateDailyLimit={app.updateDailyLimit}
          dashboardLoading={app.dashboardLoading}
          qrPreview={app.qrPreview}
          refreshQrPreview={app.refreshQrPreview}
          setQrPreview={app.setQrPreview}
        />
      );
    }

    if (activeRoute === "templates") {
      return (
        <TemplatesPage
          refreshing={app.refreshing}
          refreshAll={app.refreshAll}
          templateForm={app.templateForm}
          setTemplateForm={app.setTemplateForm}
          createTemplate={app.createTemplate}
          deleteTemplate={app.deleteTemplate}
          busy={app.busy}
          templates={app.templates}
          dashboardLoading={app.dashboardLoading}
          setNotice={app.setNotice}
        />
      );
    }

    if (activeRoute === "contactCategories") {
      return (
        <BusinessCategoriesPage
          refreshing={app.refreshing}
          refreshAll={app.refreshAll}
          busy={app.busy}
          contactCategories={app.contactCategories}
          createContactCategory={app.createContactCategory}
          deleteContactCategory={app.deleteContactCategory}
          dashboardLoading={app.dashboardLoading}
        />
      );
    }

    if (activeRoute === "contacts") {
      return (
        <BusinessesPage
          refreshing={app.refreshing}
          refreshAll={app.refreshAll}
          busy={app.busy}
          contactCategories={app.contactCategories}
          contacts={app.contacts}
          createContact={app.createContact}
          bulkInsertContacts={app.bulkInsertContacts}
          deleteContact={app.deleteContact}
          dashboardLoading={app.dashboardLoading}
        />
      );
    }

    if (activeRoute === "campaigns") {
      return (
        <CampaignsPage
          refreshing={app.refreshing}
          refreshAll={app.refreshAll}
          campaignForm={app.campaignForm}
          setCampaignForm={app.setCampaignForm}
          createCampaign={app.createCampaign}
          updateCampaign={app.updateCampaign}
          deleteCampaign={app.deleteCampaign}
          busy={app.busy}
          accounts={app.accounts}
          templates={app.templates}
          recipientsTotal={app.recipientsTotal}
          campaigns={app.campaigns}
          dashboardLoading={app.dashboardLoading}
          campaignAction={app.campaignAction}
          loadMessages={app.loadMessages}
          selectedCampaign={app.selectedCampaign}
          messagesLoading={app.messagesLoading}
          messages={app.messages}
        />
      );
    }

    if (activeRoute === "messages") {
      return (
        <MessagesPage
          accounts={app.accounts}
          conversations={app.conversations}
          conversationsLoading={app.conversationsLoading}
          conversationMessages={app.conversationMessages}
          conversationMessagesLoading={app.conversationMessagesLoading}
          activeConversationNumber={app.activeConversationNumber}
          sendingReply={app.sendingReply}
          loadConversations={app.loadConversations}
          openConversation={app.openConversation}
          sendReplyToActiveConversation={app.sendReplyToActiveConversation}
          deleteConversation={app.deleteConversation}
        />
      );
    }

    if (activeRoute === "settings") {
      return (
        <SettingsPage
          key={`${app.settings?.perMobileDailyLimit || 20}-${app.settings?.perMobileHourlyLimit || 2}-${app.settings?.antiBotEnabled || false}-${app.settings?.updatedAt || ""}`}
          settings={app.settings}
          accounts={app.accounts}
          busy={app.busy}
          saveSettings={app.saveSettings}
          refreshAll={app.refreshAll}
          refreshing={app.refreshing}
        />
      );
    }

    return (
      <DashboardPage
        stats={app.stats}
        campaigns={app.campaigns}
        accounts={app.accounts}
        refreshing={app.refreshing}
        refreshAll={app.refreshAll}
      />
    );
  }

  return (
    <>
      <AppShell
        profile={app.profile}
        notice={app.notice}
        mobileMenuOpen={mobileMenuOpen}
        setMobileMenuOpen={setMobileMenuOpen}
        activeRoute={activeRoute}
        onNavigate={navigate}
        logout={app.logout}
        onMessagesRouteOpen={app.openInbox}
      >
        {renderPage()}
      </AppShell>

      {app.booting && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/20 backdrop-blur-[2px]">
          <div className="rounded-xl bg-white px-5 py-3 text-sm font-semibold text-slate-700 shadow-xl">
            Loading...
          </div>
        </div>
      )}
    </>
  );
}

export default App;

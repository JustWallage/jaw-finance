import { useState } from "react";
import { AlertTriangle, User } from "lucide-react";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useBankConnectionContext } from "../components/BankConnectionProvider";
import { BankConnectionCard } from "../components/settings/BankConnectionCard";
import { AccountsCard } from "../components/settings/AccountsCard";
import { MerchantDictionaryCard } from "../components/settings/MerchantDictionaryCard";

export default function SettingsPage() {
  const { error, userEmail } = useBankConnectionContext();
  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false);

  return (
    <motion.div
      className="space-y-6"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <h1 className="text-2xl font-bold tracking-tight">Settings</h1>

      {error && (
        <Alert variant="destructive" data-testid="error-alert">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* User Info */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5 text-primary" />
            Account
          </CardTitle>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setLogoutDialogOpen(true)}
            data-testid="logout-button"
          >
            Log out
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-muted-foreground">
            {userEmail ?? "Not signed in"}
          </p>
          <div className="flex gap-2 text-xs">
            <a
              href="/terms"
              className="underline text-primary"
              data-testid="link-terms"
            >
              Terms
            </a>
            <a
              href="/privacy"
              className="underline text-primary"
              data-testid="link-privacy"
            >
              Privacy
            </a>
          </div>
        </CardContent>
      </Card>

      {/* Logout Confirmation */}
      <Dialog open={logoutDialogOpen} onOpenChange={setLogoutDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Log out</DialogTitle>
            <DialogDescription>
              Are you sure you want to log out?
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setLogoutDialogOpen(false)}
              data-testid="logout-cancel"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                window.location.href = "/cdn-cgi/access/logout";
              }}
              data-testid="logout-confirm"
            >
              Log out
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <BankConnectionCard />
      <AccountsCard />
      <MerchantDictionaryCard />
    </motion.div>
  );
}

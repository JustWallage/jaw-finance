import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { Loader2, Send, MessageCircle, ChevronDown, ChevronUp } from "lucide-react";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useChat } from "../hooks/useChat";

export default function ChatPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    chatQuestion,
    setChatQuestion,
    chatLoading,
    chatResult,
    chatExpanded,
    setChatExpanded,
    chatInputRef,
    thinkingDots,
    handleChatSubmit,
  } = useChat();

  // Auto-submit when navigated from Home with ?q=
  useEffect(() => {
    const q = searchParams.get("q");
    if (q && !chatResult && !chatLoading) {
      setChatQuestion(q);
      setSearchParams({}, { replace: true });
      pendingQuestion.current = q;
    }
  }, [searchParams]);

  const pendingQuestion = useRef<string | null>(null);
  useEffect(() => {
    if (pendingQuestion.current && chatQuestion === pendingQuestion.current) {
      pendingQuestion.current = null;
      handleChatSubmit();
    }
  }, [chatQuestion]);

  return (
    <motion.div
      className="space-y-6"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <h1 className="text-2xl font-bold tracking-tight">Ask your finances</h1>

      <form onSubmit={handleChatSubmit} data-testid="chat-form" className="flex gap-2">
        <Input
          ref={chatInputRef}
          placeholder="Ask about your finances..."
          value={chatQuestion}
          onChange={(e) => setChatQuestion(e.target.value)}
          disabled={chatLoading}
          data-testid="chat-input"
          className="flex-1"
          autoFocus
        />
        <Button type="submit" disabled={chatLoading || !chatQuestion.trim()} data-testid="chat-submit">
          {chatLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </form>

      {chatLoading && (
        <Card data-testid="chat-loading">
          <CardContent className="flex items-center gap-3 py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Thinking{".".repeat(thinkingDots)}</span>
          </CardContent>
        </Card>
      )}

      {chatResult && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
          <Card data-testid="chat-result-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageCircle className="h-5 w-5 text-primary" />
                Answer
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p data-testid="chat-summary" className="text-sm">{chatResult.summary}</p>
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span data-testid="chat-total-income" className="text-income">
                  +{chatResult.totalIncome.toFixed(2)} EUR
                </span>
                <span data-testid="chat-total-expense" className="text-expense">
                  -{chatResult.totalExpense.toFixed(2)} EUR
                </span>
              </div>
              {chatResult.byPath.length > 0 && (
                <div data-testid="chat-by-path" className="space-y-1">
                  {chatResult.byPath.map((p) => (
                    <div key={p.path} className="flex items-center justify-between text-xs" data-testid={`chat-path-${p.path}`}>
                      <span className="text-muted-foreground font-mono">{p.path}</span>
                      <span className="flex gap-3 shrink-0">
                        {p.totalIncome > 0 && <span className="text-income">+{p.totalIncome.toFixed(2)}</span>}
                        {p.totalExpense > 0 && <span className="text-expense">-{p.totalExpense.toFixed(2)}</span>}
                        <span className="text-muted-foreground">{p.count} tx</span>
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {chatResult.transactions.length > 0 ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setChatExpanded(!chatExpanded)}
                  data-testid="chat-toggle-transactions"
                >
                  {chatExpanded ? <ChevronUp className="h-4 w-4 mr-1" /> : <ChevronDown className="h-4 w-4 mr-1" />}
                  {chatExpanded ? "Hide" : "View all"} {chatResult.transactions.length} transactions
                </Button>
              ) : (
                <p className="text-xs text-muted-foreground">No transactions matched.</p>
              )}
              {chatExpanded && (
                <Table data-testid="chat-transactions-table">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Counterparty</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {chatResult.transactions.map((tx) => (
                      <TableRow key={tx.id} data-testid={`chat-tx-${tx.id}`}>
                        <TableCell className="whitespace-nowrap">{tx.booking_date ?? "—"}</TableCell>
                        <TableCell>{tx.counterparty_name ?? "—"}</TableCell>
                        <TableCell className={`text-right whitespace-nowrap ${tx.credit_debit === "CRDT" ? "text-income" : "text-expense"}`}>
                          {tx.credit_debit === "DBIT" ? "-" : "+"}{tx.amount} {tx.currency}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </motion.div>
      )}
    </motion.div>
  );
}

import { AdminInquiryList } from "@/widgets/admin-dashboard";
import { AdminQuoteWorkflow } from "@/widgets/admin-quote-workflow";

export default function AdminInquiriesPage() {
  return (
    <div className="grid gap-6">
      <AdminInquiryList />
      <AdminQuoteWorkflow />
    </div>
  );
}

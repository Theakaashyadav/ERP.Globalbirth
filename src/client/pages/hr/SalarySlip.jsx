import { useMemo, useState } from "react";
import { FileText, Printer } from "lucide-react";
import PageHeader from "../../components/PageHeader.jsx";

const fields = [
  ["companyName", "Company Name"], ["address1", "Address Line 1"], ["address2", "Address Line 2"], ["monthYear", "Month & Year"],
  ["empCode", "Employee Code"], ["empName", "Employee Name"], ["fhName", "F/H Name"], ["designation", "Designation"],
  ["department", "Department"], ["pfNo", "P.F. Number"], ["panNo", "PAN No."], ["bankNo", "Bank A/c No."],
  ["esiNo", "ESI Number"], ["doj", "D.O.J."], ["uan", "UAN#"], ["paidDays", "Paid Days"], ["leaveDays", "Leave"]
];

const earnings = [["basic", "BASIC"], ["hra", "H.R.A."], ["convey", "CONVEY."], ["perAllo", "PER.ALLO"], ["fuel", "FUEL"], ["uniform", "UNIFORM"], ["books", "BOOKS"], ["driver", "DRIVER S"], ["arr1", "ARR-1"], ["arr2", "ARR-2"], ["arr3", "ARR-3"], ["bonus", "BONUS"], ["dwage", "D.WAGE"], ["overtime", "OVERTIME"]];
const deductions = [["epf", "E.P.F."], ["esic", "E.S.I.C."], ["advance", "ADVANCE"], ["itax", "I.TAX"], ["lwfee", "LWFEE"], ["ptax", "P.TAX"], ["recot", "REC-OT"], ["loan", "LOAN"]];
const allInputs = [...fields, ...earnings, ...deductions];

function numberToWords(number) {
  const a = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const b = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const n = Math.round(Math.abs(number));
  if (n === 0) return "Zero";
  function words(value) {
    if (value < 20) return a[value];
    if (value < 100) return b[Math.floor(value / 10)] + (value % 10 ? " " + a[value % 10] : "");
    if (value < 1000) return a[Math.floor(value / 100)] + " Hundred" + (value % 100 ? " " + words(value % 100) : "");
    if (value < 100000) return words(Math.floor(value / 1000)) + " Thousand" + (value % 1000 ? " " + words(value % 1000) : "");
    if (value < 10000000) return words(Math.floor(value / 100000)) + " Lakh" + (value % 100000 ? " " + words(value % 100000) : "");
    return words(Math.floor(value / 10000000)) + " Crore" + (value % 10000000 ? " " + words(value % 10000000) : "");
  }
  return words(n);
}

export default function SalarySlip() {
  const [form, setForm] = useState(Object.fromEntries(allInputs.map(([key]) => [key, ""])));

  function update(key, value) {
    setForm(current => ({ ...current, [key]: value }));
  }

  const totals = useMemo(() => {
    const num = key => Number(form[key]) || 0;
    const totalEarning = earnings.reduce((sum, [key]) => sum + num(key), 0);
    const totalDeduction = deductions.reduce((sum, [key]) => sum + num(key), 0);
    return { totalEarning, totalDeduction, netPay: totalEarning - totalDeduction };
  }, [form]);

  return (
    <main className="screen">
      <div className="wide">
        <div className="noPrint">
          <PageHeader icon={FileText} title="Salary Slip Generator" subtitle="Generate professional employee salary slips and print instantly." />
          <section className="panel">
            <div className="formGrid">
              {allInputs.map(([key, label]) => (
                <div className="field" key={key}>
                  <label>{label}</label>
                  <input value={form[key]} onChange={event => update(key, event.target.value)} />
                </div>
              ))}
            </div>
            <button className="btn green" onClick={() => window.print()}><Printer size={18} /> Print Salary Slip</button>
          </section>
        </div>

        <section className="salarySlip">
          <div style={{ textAlign: "right", marginBottom: 26, lineHeight: 1.4 }}>
            <b>{form.companyName || "\u00a0"}</b><br />
            <span>{form.address1 || "\u00a0"}</span><br />
            <span>{form.address2 || "\u00a0"}</span>
          </div>
          <p style={{ textAlign: "center" }}>Salary Slip for the month of <b>{form.monthYear || "__________"}</b></p>
          <table>
            <tbody>
              <tr><td colSpan="3">Employee Code: {form.empCode}<br />Employee Name: <b>{form.empName}</b><br />F/H Name: {form.fhName}<br />Designation: {form.designation}<br />Department: {form.department}</td><td colSpan="2">P.F. Number: {form.pfNo}<br />PAN No.: {form.panNo}<br />Bank A/c No.: {form.bankNo}<br />ESI Number: {form.esiNo}<br />D.O.J.: {form.doj}<br />UAN#: {form.uan}</td></tr>
              <tr><td>Paid Days</td><td>{form.paidDays}</td><td>Leave</td><td colSpan="2">{form.leaveDays}</td></tr>
              <tr><th></th><th>Rate</th><th>Earnings</th><th>Deductions</th><th></th></tr>
              {Array.from({ length: 14 }).map((_, index) => {
                const earn = earnings[index] || ["", ""];
                const ded = deductions[index] || ["", ""];
                return <tr key={index}><td>{earn[1]}</td><td style={{ textAlign: "right" }}>{form[earn[0]]}</td><td style={{ textAlign: "right" }}>{form[earn[0]]}</td><td>{ded[1]}</td><td style={{ textAlign: "right" }}>{form[ded[0]]}</td></tr>;
              })}
              <tr><td>Total</td><td style={{ textAlign: "right" }}><b>{totals.totalEarning.toFixed(2)}</b></td><td style={{ textAlign: "right" }}><b>{totals.totalEarning.toFixed(0)}</b></td><td>Total</td><td style={{ textAlign: "right" }}><b>{totals.totalDeduction.toFixed(2)}</b></td></tr>
              <tr><td colSpan="3"><b>Net Payable for the Month {form.monthYear || "__________"}</b></td><td colSpan="2" style={{ textAlign: "center" }}><b>{totals.netPay.toFixed(2)}</b></td></tr>
              <tr><td colSpan="5"><b>(Rupees {numberToWords(totals.netPay)} Only)</b></td></tr>
              <tr><td colSpan="5"><b><i>Note : This is computer generated statement and does not require signature</i></b></td></tr>
            </tbody>
          </table>
        </section>
      </div>
    </main>
  );
}

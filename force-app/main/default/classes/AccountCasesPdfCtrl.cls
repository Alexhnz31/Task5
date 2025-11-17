public without sharing class AccountCasesPdfCtrl {
    //обертка для пдфки
    public List<CaseWrapper> caseRows { get; set; }
    public String weekStart { get; set; }
    public String weekEnd { get; set; }
    public String generatedDate { get; set; }

    public AccountCasesPdfCtrl() {
        Date startOfLastWeek = Date.today().toStartOfWeek().addDays(-7);
        Date endOfLastWeek = startOfLastWeek.addDays(6);

        weekStart = startOfLastWeek.format(); 
        weekEnd = endOfLastWeek.format();  
        generatedDate = DateTime.now().format('MMMM d, yyyy h:mm a');

        caseRows = getAccountCasesPrevWeek(startOfLastWeek, endOfLastWeek);
    }
    // получаем аккаунты + кейсы за прошлый вик
    private List<CaseWrapper> getAccountCasesPrevWeek(Date startDate, Date endDate) {
        List<Case> cases = [
            SELECT Account.Name, Account.Owner.Name, CaseNumber, Status, Priority, Origin
            FROM Case
            WHERE CreatedDate >= :startDate AND CreatedDate <= :endDate
            ORDER BY Account.Name, CaseNumber
        ];

        List<CaseWrapper> rows = new List<CaseWrapper>();
        for (Case c : cases) {
            rows.add(new CaseWrapper(c));
        }
        return rows;
    }
    public class CaseWrapper {
        public String accountName{ get; set; }
        public String accountOwnerName { get; set; }
        public String caseNumber{ get; set; }
        public String status{ get; set; }
        public String priority{ get; set; }
        public String origin{ get; set; }

        public CaseWrapper(Case c) {
            this.accountName= c.Account?.Name;
            this.accountOwnerName = c.Account?.Owner?.Name;
            this.caseNumber= c.CaseNumber;
            this.status= c.Status;
            this.priority= c.Priority;
            this.Origin= c.Origin;
        }
    }
}
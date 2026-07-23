export interface PaginatedResponse<T> { data: T[]; total: number; }
export interface ApiResponse<T> { data: T; message: string; }

export interface Category { id: string; name: string; description?: string; isActive: boolean; parentId?: string; }
export interface ProductActiveIngredient { name: string; concentration?: string; }
export interface Product { id: string; name: string; description?: string; categoryId: string; unit: string; activeIngredient?: string; activeIngredients?: ProductActiveIngredient[]; taxType?: string; prices: ProductPrice[]; tracksLot?: boolean; isActive: boolean; minSalePrice?: number; minMarginPercent?: number; location?: string; locations?: string[]; supplier?: string; control?: string; cultivo?: string; dosis?: string; imageUrl?: string; createdAt: string; }
export interface ProductPrice { priceTierId: string; companyId?: string; branchId?: string; price: number; }
export interface Company { id: string; name: string; ruc: string; address?: string; phone?: string; isActive: boolean; }
export interface PriceTier { id: string; name: string; description?: string; priority: number; isActive: boolean; }
export interface Stock { id: string; productId: string; companyId: string; quantity: number; lastUpdated: string; }
export interface Client { id: string; name: string; documentNumber?: string; phone?: string; email?: string; address?: string; isActive: boolean; }

export interface PaymentMethod { id: string; name: string; isActive: boolean; }
export interface SalePayment { paymentMethodId: string; paymentMethodName: string; amount: number; }
export interface Sale { id: string; companyId?: string; clientId?: string; items: SaleItem[]; total: number; voucherType: string; isCredit: boolean; payments: SalePayment[]; isCancelled?: boolean; cancelledBy?: string; cancelledAt?: string; cancelReason?: string; date: string; createdAt: string; }
export interface SaleItem { productId: string; productName?: string; companyId: string; quantity: number; priceTier: string; unitPrice: number; subtotal: number; }
export interface Supplier { id: string; ruc: string; businessName: string; address?: string; phone?: string; isActive: boolean; }
export type PurchaseDocumentType = 'FACTURA' | 'BOLETA' | 'GUIA' | 'NOTA_CREDITO' | 'OTRO';
export type PurchaseReceptionStatus = 'PENDING' | 'PARTIAL' | 'RECEIVED';
export interface PurchaseItem { productId: string; productName?: string; quantity: number; receivedQty?: number; unitCost?: number; unitPriceSinIgv?: number; unitPriceConIgv?: number; flete?: number; otrosCostos?: number; precioVenta?: number; precioMinorista?: number; precioEspecial?: number; markupPercent?: number; markupMinoristaPercent?: number; markupEspecialPercent?: number; minMarginPercent?: number; lotNumber?: string; expirationDate?: string; }
export interface PurchaseReceptionItem { productId: string; productName?: string; quantity: number; }
export interface PurchaseReception { id?: string; date: string; receivedBy?: string; receivedByName?: string; notes?: string; items: PurchaseReceptionItem[]; }
export interface RemisionGuia { serie: string; correlativo: string; fecha: string; }
export interface Purchase { id: string; companyId: string; supplier: string; supplierId?: string; supplierRuc?: string; items: PurchaseItem[]; totalCost: number; totalCostUsd?: number; exchangeRate?: number; receptionStatus?: PurchaseReceptionStatus; receptions?: PurchaseReception[]; paymentType: 'CONTADO' | 'CREDITO' | 'PENDIENTE_ACUERDO'; paymentScheduleType?: 'SINGLE_DATE' | 'INSTALLMENTS' | 'PENDIENTE_ACUERDO'; dueDate?: string; date: string; createdAt: string; documentType?: PurchaseDocumentType; documentSeries?: string; documentNumber?: string; issueDate?: string; remisionGuia?: RemisionGuia; isHistorical?: boolean; }
export interface ProductLot { id: string; productId: string; companyId: string; lotNumber: string; expirationDate?: string; initialQuantity: number; currentQuantity: number; purchaseId?: string; receivedAt: string; isActive: boolean; }

export type QuoteStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED' | 'CONVERTED';
export interface QuoteItem { productId: string; companyId: string; quantity: number; priceTier: string; unitPrice: number; subtotal: number; }
export interface Quote { id: string; quoteNumber: string; series: string; number: number; companyId?: string; clientId?: string; clientName?: string; items: QuoteItem[]; total: number; notes?: string; status: QuoteStatus; issueDate: string; validUntil: string; convertedSaleId?: string; createdBy?: string; createdAt: string; }

export interface AccountPayableInstallment { id?: string; amount: number; dueDate: string; status: 'PENDING' | 'PAID'; paidDate?: string; paidAmountPen?: number; numeroUnico?: string; }
export interface AccountPayablePayment { id?: string; amount: number; paymentDate: string; codigoTransferencia: string; notes?: string; registeredBy?: string; registeredByName?: string; voucherUrl?: string; }
export interface AccountPayable { id: string; purchaseId: string; purchaseRef?: string; agreementId?: string; supplier: string; totalAmount: number; paidAmount: number; pendingAmount: number; status: 'PENDING' | 'PARTIAL' | 'PAID' | 'CONSOLIDATED'; paymentScheduleType: 'SINGLE_DATE' | 'INSTALLMENTS' | 'PENDIENTE_ACUERDO'; dueDate?: string; installments: AccountPayableInstallment[]; payments: AccountPayablePayment[]; currency?: 'PEN' | 'USD'; totalAmountPen?: number; numeroUnico?: string; createdBy?: string; createdAt: string; }
export interface APAlerts { overdue: AccountPayable[]; upcoming: AccountPayable[]; summary: { totalPending: number; totalOverdue: number; count: number }; }

export interface AgreementInvoice { apId: string; purchaseId?: string; purchaseRef?: string; amount: number; }
export interface AgreementInstallment { id?: string; amount: number; dueDate: string; status: 'PENDING' | 'PAID'; paidDate?: string; voucherUrl?: string; }
export interface AgreementPayment { id?: string; amount: number; paymentDate: string; codigoTransferencia: string; notes?: string; registeredBy?: string; registeredByName?: string; voucherUrl?: string; }
export interface PaymentAgreement { id: string; supplier: string; invoices: AgreementInvoice[]; totalAmount: number; paidAmount: number; pendingAmount: number; status: 'PENDING' | 'PARTIAL' | 'PAID' | 'CANCELLED'; paymentScheduleType: 'SINGLE_DATE' | 'INSTALLMENTS'; currency?: 'PEN' | 'USD'; dueDate?: string; installments: AgreementInstallment[]; payments: AgreementPayment[]; documentType?: 'FACTURA' | 'BOLETA'; documentSeries?: string; documentNumber?: string; remisionGuia?: RemisionGuia; notes?: string; cancellationReason?: string; cancelledAt?: string; createdAt: string; }
export interface Branch { id: string; code: string; name: string; address?: string; phone?: string; companyIds: string[]; defaultCompanyId?: string; isActive: boolean; isMain: boolean; }
export interface UserBranchAssignment { branchId: string; role: string; }
export interface User { id: string; username: string; email?: string; fullName: string; role: string; branchAssignments?: UserBranchAssignment[]; isActive?: boolean; createdAt?: string; updatedAt?: string; }

export interface StockAdjustment { id: string; productId: string; companyId: string; type: 'INCREASE' | 'DECREASE'; quantity: number; reason: string; previousQuantity: number; newQuantity: number; adjustedBy?: string; date: string; createdAt: string; }

export interface CashRegisterEntry { id: string; type: 'INCOME' | 'EXPENSE'; category: 'SALE' | 'CREDIT_PAYMENT' | 'PURCHASE' | 'ADJUSTMENT' | 'OTHER'; description: string; amount: number; referenceId?: string; referenceType?: string; voucherType: string; voucherSeries?: string; voucherNumber?: string; remisionGuia?: RemisionGuia; isDeleted: boolean; deletedBy?: string; deletedAt?: string; deleteReason?: string; editHistory: { previousAmount: number; newAmount: number; reason: string; editedBy: string; editedAt: string }[]; createdBy?: string; createdAt?: string; paymentGroupId?: string; paymentGroupTotal?: number; }
export interface CashRegister { id: string; date: string; openingBalance: number; status: 'OPEN' | 'CLOSED'; entries: CashRegisterEntry[]; closingBalance?: number; closedBy?: string; closedAt?: string; notes?: string; createdBy?: string; }

export interface CreditPayment { id: string; amount: number; paymentDate: string; paymentMethodId?: string; paymentMethodName?: string; cashRegisterEntryId?: string; notes?: string; receivedBy?: string; receivedByName?: string; paymentGroupId?: string; }
export interface CreditSaleDetail { saleId: string; date: string; total: number; items: { productId: string; productName: string; companyId: string; companyName: string; priceTier?: string; quantity: number; unitPrice: number; subtotal: number; }[]; }
export interface CreditAccount { id: string; clientId: string; name?: string; saleIds: string[]; saleDetails?: CreditSaleDetail[]; totalAmount: number; paidAmount: number; pendingAmount: number; status: 'PENDING' | 'PARTIAL' | 'PAID'; payments: CreditPayment[]; createdBy?: string; createdAt: string; }

export interface LoanItem { productId: string; productName?: string; companyId: string; companyName?: string; quantity: number; returnedQuantity: number; }
export interface LoanReturnItem { productId: string; productName?: string; companyId: string; companyName?: string; quantity: number; }
export interface LoanReturn { id?: string; items: LoanReturnItem[]; notes?: string; returnedBy?: string; date: string; }
export interface Loan { id: string; borrowerName: string; items: LoanItem[]; status: 'ACTIVE' | 'PARTIAL' | 'RETURNED'; returns: LoanReturn[]; notes?: string; date: string; createdBy?: string; createdAt: string; }

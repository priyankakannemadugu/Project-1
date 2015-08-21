/**
 * Module Description
 * 
 * Version    Date            Author           Remarks
 * 1.00       23 Sep 2013     Sailatha        This script runs everyday, searches for customers with Cancellation Requested = true and Cancellation Date = today, and updates the role in vbulletin and netsuite as "Once a subscriber"
 *
 */


//This fnction searches for customers with Cancellation Requested = true and Cancellation Date = today, and updates the role in vbulletin and netsuite as "Once a subscriber"

var MINIMUM_USAGE = 100;
function cancelMemberships(type) {

	
	try
	{
		var headers = {};
      	headers['Accept'] = 'application/soap+xml,application/json, application/dime, multipart/related, text/*';
      	headers['Content-Type'] = 'application/x-www-form-urlencoded';
      	
		//get all the customers with cancellation requested= true and cancellation date = today

		var customerSearch = nlapiLoadSearch('customer', 'customsearch_cancel_memberships');
		var searchResults = customerSearch.runSearch();

		var results = [];
		var searchid = 0;
		var resultslice = '';
		do {
			resultslice = searchResults.getResults(searchid, searchid + 1000);
			for ( var rs in resultslice) 
			{
				results.push(resultslice[rs]);
				searchid++;
			}
			nlapiLogExecution('ERROR', 'Cancel memberships Scheduled script', 'There are '+ results.length + ' customers for to cancel memberships.');
			
			if (results != null && results != '')
			{
				
				for ( var it = 0; it < results.length; it++) 
				{

					if (nlapiGetContext().getRemainingUsage() <= MINIMUM_USAGE)
					{
						nlapiLogExecution('AUDIT','Cancel memberships Scheduled script','Not enough usage left('+ nlapiGetContext().getRemainingUsage()	+ ') . Exiting and rescheduling script.');
						setRecoveryPoint();
						checkGovernance();

					}
					var customerId = results[it].getId();
					var customerName = results[it].getValue('firstname');
					nlapiLogExecution('ERROR', 'Cancel memberships Scheduled script',  'customerName = '+ customerName + ' customerId = '+ customerId);
					try
					{
						//updating the role as "Once a subscriber" in vbulletin
						var roleUpdateUrl = 'http://beta-www.funimation.com/frontend_api/updateUserRole/username/'+(customerName.trim())+'/role_id/12';
                    	
			          	var role_resStatus = nlapiRequestURL(roleUpdateUrl ,null ,headers);
			          								            
			            var roleResBody = role_resStatus.getBody();
			          	var roleResCode = role_resStatus.getCode();
			          	if(roleResCode == 200)
			          		{
			          		nlapiLogExecution('ERROR', 'Cancel memberships Scheduled script', 'Updated role in vbulletin');
			          		
			          		}
			          	else
			          		{
			          		throw 1;
			          		}
			          	
						
 				        //updating the role as "Once a subscriber" in customer and resetting the cancellation requested and canellation date                
						var cust_id = nlapiSubmitField('customer', customerId, ['custentity_role','custentity_cancellation_requested','custentity_cancellation_date','custentity_subscription_start_date','custentity_subscription_status'], ['2','F','','','2']);//2-"Once a subscriber"-Role custom list
						if(cust_id !=  null && cust_id != '')
							{
							nlapiLogExecution('ERROR', 'Cancel memberships Scheduled script', 'Updated role in customer.');
							}
						else
							{
							throw 2;
							}
				    }
	          	
			          	catch(e)
		            	{
		            		
		            		switch (e) {
		                    case 1:
		                    	nlapiLogExecution('ERROR', 'Cancel memberships Scheduled script', 'Problem connecting to the update API.');
		                        break;
		                    case 2:
		                    	nlapiLogExecution('ERROR', 'Cancel memberships Scheduled script', 'Problem updating role in customer.');
		                        break;
		                    default:
		                        if (e instanceof nlobjError) {
		                        	nlapiLogExecution('ERROR', 'Cancel memberships Scheduled script', 'There was a netsuite error while trying to connect to live funimation url or while updating customer to update role- '+e.getCode() + '\n' + e.getDetails());
		                        } else {
		                        	nlapiLogExecution('ERROR', 'Cancel memberships Scheduled script', 'There was an unexpected error while trying to connect to live funimation url or while updating customer to update role ' + e.toString());
		                        }
		                        break;
		                            
		            	   }
	            	}
				}
				
				
			}
		}while (resultslice.length >= 1000);
		
		
	} catch (e) {

		if (e instanceof nlobjError)
		{
			nlapiLogExecution('ERROR', 'Cancel memberships Scheduled script','There was an unexpected netsuite error - ' + e.getCode()
							+ '\n' + e.getDetails());

		} else
		{
			nlapiLogExecution('ERROR', 'Cancel memberships Scheduled script','There was an unexpected error ' + e.toString());

		}

		if (nlapiGetContext().getRemainingUsage() <= MINIMUM_USAGE) 
		{
			nlapiLogExecution('AUDIT', 'Cancel memberships scheduled script',
					'Not enough usage left('
							+ nlapiGetContext().getRemainingUsage()
							+ ') . Exiting and rescheduling script.');
			setRecoveryPoint();
			checkGovernance();

		}
	}

	//nlapiLogExecution('DEBUG', 'Completed cancelling the membership of  customers ');
}

function setRecoveryPoint() {
	var state = nlapiSetRecoveryPoint(); // 100 point governance
	if (state.status == 'SUCCESS')
		return; // we successfully create a new recovery point
	if (state.status == 'RESUME') // a recovery point was previously set, we
	// are resuming due to some unforeseen error
	{
		nlapiLogExecution("ERROR", "Resuming script because of " + state.reason
				+ ".  Size = " + state.size);
		return;
	} else if (state.status == 'FAILURE') // we failed to create a new
	// recovery point
	{
		nlapiLogExecution("ERROR", "Failed to create recovery point. Reason = "
				+ state.reason + " / Size = " + state.size);
	}
}

function checkGovernance() {
	var context = nlapiGetContext();
	if (context.getRemainingUsage() < MINIMUM_USAGE) {
		var state = nlapiYieldScript();
		if (state.status == 'FAILURE') {
			nlapiLogExecution("ERROR",
					"Failed to yield script, exiting: Reason = " + state.reason
							+ " / Size = " + state.size);
			throw "Failed to yield script";
		}
	}
}

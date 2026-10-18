import {test,expect} from '@playwright/test';

test.beforeEach(async({page})=>{
 await page.route('**/api/assistant/status',route=>route.fulfill({json:{ready:false,authRequired:true}}));
});
const history=async page=>{const button=page.locator('.chat-mobile-toolbar button').first();if(await button.isVisible())await button.click();};
test('chat history survives navigation/reload, separates new chats and restores one trip form',async({page},testInfo)=>{
 await page.goto('/?page=ai');
 const message='Tạo chuyến đi 3 ngày 2 đêm từ Hà Nội đến Hải Phòng';
 await page.locator('#assistant-message').fill(message);await page.getByRole('button',{name:'Gửi',exact:true}).click();
 await expect(page.locator('.trip-intake-form')).toBeVisible();
 const checkbox=await page.locator('.intake-return input').boundingBox();expect(checkbox.width).toBeLessThanOrEqual(22);
 await expect(page.locator('.trip-intake-form .province-select').last()).toHaveValue('Hải Phòng');
 await page.locator('.trip-intake-form input[type=date]').fill('2026-11-07');
 const numbers=page.locator('.trip-intake-form input[type=number]');await numbers.nth(2).fill('2');await numbers.nth(3).fill('1');
 await page.locator('.trip-intake-form textarea').fill('Ẩm thực và biển');
 await page.locator('.time-picker-trigger').click();await page.getByRole('button',{name:'Chọn giờ',exact:true}).click();
 await page.getByRole('button',{name:'Tạo lịch trình',exact:true}).click();
 await expect(page.locator('.ai-message.user').last()).toContainText('2 người / 1 xe');
 await expect(page.locator('.trip-intake-form')).toHaveCount(1);
 const content=await page.locator('.ai-messages').textContent();expect(content).not.toContain('Bạn muốn chạy xe tối đa');
 await page.reload();await expect(page.locator('.trip-intake-form input[type=date]')).toHaveValue('2026-11-07');await expect(page.locator('.trip-intake-form textarea')).toHaveValue('Ẩm thực và biển');
 await page.locator('.nav nav').getByRole('button',{name:'Kế hoạch',exact:true}).click();await page.locator('.nav nav').getByRole('button',{name:'AI Assistant',exact:true}).click();
 await expect(page.locator('.trip-intake-form')).toBeVisible();
 await history(page);await page.locator('.chat-history-heading button').click();
 await expect(page.locator('.trip-intake-form')).toHaveCount(0);
 await page.locator('#assistant-message').fill('Xin chào');await page.getByRole('button',{name:'Gửi',exact:true}).click();
 await expect(page.locator('.ai-message.user')).toHaveCount(1);await history(page);
 await expect(page.locator('.chat-history-open')).toHaveCount(2);
 await page.locator('.chat-history-open').filter({hasText:'Hải Phòng'}).click();
 await expect(page.locator('.trip-intake-form textarea')).toHaveValue('Ẩm thực và biển');
 await history(page);await page.locator('.chat-history-list li.selected').getByRole('button',{name:/Đổi tên/}).click();
 await page.locator('.chat-history-list form input').fill('Chuyến Hải Phòng cuối tuần');await page.getByRole('button',{name:'Lưu tên',exact:true}).click();
 await page.locator('.chat-history-search input').fill('cuối tuần');await expect(page.locator('.chat-history-open')).toHaveCount(1);
 await page.screenshot({path:`output/mobile/screenshots/${testInfo.project.name}-chat-history.png`,fullPage:true});
 page.once('dialog',dialog=>dialog.accept());await page.locator('.chat-history-actions button').last().click();
 await expect(page.locator('.chat-history-open')).toHaveCount(0);await page.locator('.chat-history-search input').fill('');await expect(page.locator('.chat-history-open')).toHaveCount(1);
 await page.reload();await history(page);await expect(page.locator('.chat-history-open')).toHaveCount(1);
});


import re

with open('frontend/src/components/layout/AppSidebar.vue', 'r', encoding='utf-8') as f:
    content = f.read()

# Ìæ»»²à±ßÀ¸ Logo
target_sidebar = re.compile(r'<div class=\"w-8 h-8 rounded-lg flex items-center justify-center font-bold shrink-0 transition-colors\"[\s\S]*?AI</div>')
replacement_sidebar = '''<div class=\"w-8 h-8 flex items-center justify-center shrink-0 transition-all overflow-hidden\"
             :class=\"modelValue ? 'p-0.5' : 'p-1 opacity-80'\">
          <img src=\"/logo.png\" alt=\"Logo\" class=\"w-full h-full object-contain\" />
        </div>'''
new_content = target_sidebar.sub(replacement_sidebar, content)

with open('frontend/src/components/layout/AppSidebar.vue', 'w', encoding='utf-8') as f:
    f.write(new_content)
print('Replacement done.')

